// map.js - 지도 메인 페이지: 표정 스티커 마커, 이 곳의 기억, 일기 상세 + 수정
let map, clusterer, diaries = [], places = {};

// ---------- 시작 ----------
(async function init() {
  await renderNav('map');
  renderLegend();

  try {
    await loadKakao(); // 카카오 SDK 로딩
  } catch (err) {
    document.getElementById('map').innerHTML =
      `<div style="padding:40px; text-align:center; color:#A4977C;">${err.message}</div>`;
    return;
  }

  // 지도 생성 (기본 중심: 서울시청, 데이터가 있으면 아래에서 범위 재조정)
  map = new kakao.maps.Map(document.getElementById('map'), {
    center: new kakao.maps.LatLng(37.5665, 126.978),
    level: 8,
  });

  // 클러스터러: 지도를 축소하면 가까운 마커들을 숫자 하나로 합쳐 줌
  // (스타일도 손글씨 테마에 맞게 종이색 + 펜 테두리로)
  clusterer = new kakao.maps.MarkerClusterer({
    map,
    averageCenter: true,
    minLevel: 7, // 지도 레벨 7부터 합치기 시작
    styles: [{
      width: '52px', height: '52px',
      background: '#FFFDF6', border: '2px solid #5B4A3A', borderRadius: '50%',
      color: '#5B4A3A', textAlign: 'center', lineHeight: '49px',
      fontFamily: 'Gaegu', fontWeight: '700', fontSize: '17px',
      boxShadow: '2px 3px 4px rgba(0,0,0,.2)',
    }],
  });

  await loadDiaries();

  // 캘린더에서 "?diary=ID" 로 넘어온 경우 해당 일기를 바로 열어 줌
  const diaryId = new URLSearchParams(location.search).get('diary');
  if (diaryId) {
    const d = diaries.find((x) => x.id == diaryId);
    if (d) showDetail(d);
  }
})();

// 기간 필터가 바뀌면 common.js의 renderNav가 이 함수를 불러 줌
window.applyFilter = async () => {
  closePanel();
  await loadDiaries();
};

// ---------- 일기 불러와서 마커 그리기 ----------
async function loadDiaries() {
  diaries = await api('/api/diaries');
  const visible = filterDiaries(diaries); // 기간 필터 적용 (common.js)

  // 같은 장소의 일기들을 하나로 묶기 (장소명 + 좌표 4자리 반올림을 키로 사용)
  places = {};
  for (const d of visible) {
    const key = d.place_name + '|' + d.lat.toFixed(4) + '|' + d.lng.toFixed(4);
    if (!places[key]) places[key] = { name: d.place_name, address: d.address, lat: d.lat, lng: d.lng, list: [] };
    places[key].list.push(d);
  }

  const markers = [];
  const bounds = new kakao.maps.LatLngBounds();

  for (const key in places) {
    const p = places[key];
    const emotion = dominantEmotion(p.list); // 대표 감정 (가장 많이 나온 것)
    const size = Math.min(34 + p.list.length * 6, 58); // 일기가 많을수록 큰 마커 (최대 58px)

    // 표정 스티커 SVG를 마커 이미지로 사용 (faceSVG는 common.js)
    // 일기가 2개 이상이면 숫자 뱃지가 같이 그려짐
    const svg = faceSVG(emotion, size, p.list.length);
    const image = new kakao.maps.MarkerImage(
      'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg),
      new kakao.maps.Size(size, size),
      { offset: new kakao.maps.Point(size / 2, size / 2) }
    );

    const pos = new kakao.maps.LatLng(p.lat, p.lng);
    const marker = new kakao.maps.Marker({ position: pos, image, title: p.name });
    kakao.maps.event.addListener(marker, 'click', () => showPlace(key));

    markers.push(marker);
    bounds.extend(pos);
  }

  clusterer.clear();
  clusterer.addMarkers(markers);

  // 기록이 있으면 내 기록이 모인 범위로 지도를 자동 조정
  if (visible.length > 0) map.setBounds(bounds, 60);
  else showEmpty(diaries.length > 0);
}

// ---------- 사이드 패널: 이 곳의 기억 ----------
function showPlace(key) {
  const p = places[key];
  if (!p) return closePanel();
  const sorted = [...p.list].sort((a, b) => a.diary_date.localeCompare(b.diary_date)); // 시간순

  const body = document.getElementById('panelBody');
  body.innerHTML = `
    <h2>${p.name}</h2>
    <p class="addr">${p.address || ''} · 이 곳의 기억 ${p.list.length}개</p>
    ${sorted.map((d) => `
      <div class="diary-item" data-id="${d.id}">
        <div class="d-row">
          <div class="d-face">${faceSVG(d.emotion, 34, 0)}</div>
          <div>
            <span class="d-date">${prettyDate(d.diary_date)}</span>
            <p class="d-title">${d.ai_title || '(제목 없음)'}</p>
          </div>
        </div>
      </div>`).join('')}
    <button class="btn main" style="width:100%; margin-top:16px;" id="writeHereBtn">＋ 이 곳에 새 기억 남기기</button>
  `;

  // 각 일기 카드 클릭 -> 상세 보기
  body.querySelectorAll('.diary-item').forEach((el) => {
    el.onclick = () => {
      const d = diaries.find((x) => x.id == el.dataset.id);
      showDetail(d, key); // key를 넘겨서 "뒤로" 버튼이 장소 목록으로 돌아가게 함
    };
  });

  // + 버튼: 이 장소가 미리 선택된 채로 작성 페이지 열기
  document.getElementById('writeHereBtn').onclick = () => {
    sessionStorage.setItem('prefillPlace', JSON.stringify({
      name: p.name, address: p.address, lat: p.lat, lng: p.lng,
    }));
    location.href = '/write.html';
  };

  openPanel();
}

// ---------- 사이드 패널: 일기 상세 (제목 + 감정 수정 가능) ----------
function showDetail(d, backKey) {
  const body = document.getElementById('panelBody');

  // 음악 임베드(iframe) 주소 만들기
  let musicEmbed = '';
  if (d.music_url) {
    if (/youtube\.com|youtu\.be/.test(d.music_url)) {
      // 유튜브 링크에서 영상 ID 추출 (watch?v=ID 또는 youtu.be/ID 형태)
      const m = d.music_url.match(/(?:v=|youtu\.be\/)([\w-]{11})/);
      if (m) musicEmbed = `<iframe height="200" src="https://www.youtube.com/embed/${m[1]}" allowfullscreen></iframe>`;
    } else if (/open\.spotify\.com/.test(d.music_url)) {
      // 스포티파이는 주소에 /embed 만 끼워 넣으면 플레이어가 됨
      const embedUrl = d.music_url.replace('open.spotify.com/', 'open.spotify.com/embed/').split('?')[0];
      musicEmbed = `<iframe height="152" src="${embedUrl}" allow="encrypted-media"></iframe>`;
    }
  }

  body.innerHTML = `
    <div class="detail">
      <button class="back" id="backBtn">← ${backKey ? '장소의 기억으로' : '닫기'}</button>
      <span class="d-date">${prettyDate(d.diary_date)} · ${d.place_name}</span>
      <h2 style="margin-top:4px;">${d.ai_title || '(제목 없음)'}</h2>
      <span class="emo-badge" style="margin-top:10px;">${faceSVG(d.emotion, 22, 0)}${d.emotion}</span>
      ${d.photo_path ? `
        <div class="polaroid"><img src="${d.photo_path}" alt="일기 사진"><div class="cap">${d.place_name}에서</div></div>` : ''}
      <p class="content">${d.content}</p>
      ${d.music_title ? `
        <div class="musicbox">
          <div class="art">${d.music_thumbnail ? `<img src="${d.music_thumbnail}" alt="">` : '♪'}</div>
          <div><div class="mt">${d.music_title}</div></div>
        </div>` : ''}
      ${musicEmbed}

      <label style="margin-top:18px;">제목(요약) 고치기</label>
      <input id="titleSel" value="${(d.ai_title || '').replace(/"/g, '&quot;')}">
      <div class="row">
        <select id="emoSelect">
          ${EMOTION_LIST.map((e) => `<option ${e === d.emotion ? 'selected' : ''}>${e}</option>`).join('')}
        </select>
        <button class="btn" id="editSave" style="white-space:nowrap; font-size:15px;">수정 저장</button>
        <button class="btn danger" id="delBtn" style="white-space:nowrap; font-size:15px;">삭제</button>
      </div>
      <p class="hint" style="margin-top:8px;">AI의 판단은 참고일 뿐 — 제목도 감정도 직접 고칠 수 있어요.</p>
    </div>
  `;

  // 뒤로 가기: 장소 목록으로, 없으면 패널 닫기
  document.getElementById('backBtn').onclick = () => (backKey ? showPlace(backKey) : closePanel());

  // 제목 + 감정 수정 (한 번의 PUT으로 같이 저장)
  document.getElementById('editSave').onclick = async () => {
    const ai_title = document.getElementById('titleSel').value.trim();
    const emotion = document.getElementById('emoSelect').value;
    await api(`/api/diaries/${d.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ai_title, emotion }),
    });
    await loadDiaries(); // 마커 표정/뱃지 갱신
    const updated = diaries.find((x) => x.id == d.id);
    showDetail(updated, backKey);
  };

  // 삭제
  document.getElementById('delBtn').onclick = async () => {
    if (!confirm('이 기억을 삭제할까요?')) return;
    await api(`/api/diaries/${d.id}`, { method: 'DELETE' });
    closePanel();
    await loadDiaries();
  };

  openPanel();
}

// ---------- 패널 열기/닫기, 범례, 빈 화면 ----------
function openPanel() { document.getElementById('panel').classList.add('open'); map && map.relayout(); }
function closePanel() { document.getElementById('panel').classList.remove('open'); map && map.relayout(); }
document.getElementById('panelClose').onclick = closePanel;

// 범례: 9가지 감정 표정 + 이름
function renderLegend() {
  document.getElementById('legend').innerHTML = EMOTION_LIST
    .map((e) => `<span class="l-item">${faceSVG(e, 20, 0)}${e}</span>`)
    .join('');
}

// 기록이 하나도 없을 때 (hasAny=true면 "이 기간에" 없는 것)
function showEmpty(hasAny) {
  const body = document.getElementById('panelBody');
  body.innerHTML = hasAny ? `
    <h2>이 기간엔 기억이 없어요</h2>
    <p class="hint" style="margin:10px 0 16px;">위의 기간 필터를 "전체"로 바꾸면 모든 기억이 보여요.</p>
  ` : `
    <h2>아직 기억이 없어요</h2>
    <p class="hint" style="margin:10px 0 16px;">첫 번째 기억을 남겨 보세요.</p>
    <a class="btn main" href="/write.html">기록하러 가기</a>
  `;
  openPanel();
}
