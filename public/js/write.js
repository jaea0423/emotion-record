// write.js - 일기 작성 페이지: 장소 검색, 음악 미리보기, 저장 + AI 결과 즉시 수정
let selectedPlace = null; // 검색에서 고른 장소 {name, address, lat, lng}
let musicInfo = null;     // oEmbed로 가져온 곡 정보 {title, thumbnail}
let placesService = null; // 카카오 장소 검색 객체

(async function init() {
  await renderNav('write');

  // 날짜 기본값 = 오늘
  document.getElementById('diaryDate').value = new Date().toISOString().slice(0, 10);

  // ----- 컨텍스트 작성(+ 버튼)으로 넘어온 경우 미리 채우기 -----
  // 지도 패널의 "＋ 이 곳에 새 기억 남기기" -> 장소 미리 선택
  const prefillPlace = sessionStorage.getItem('prefillPlace');
  if (prefillPlace) {
    sessionStorage.removeItem('prefillPlace'); // 한 번 쓰면 지움
    try {
      const p = JSON.parse(prefillPlace);
      selectedPlace = { name: p.name, address: p.address, lat: p.lat, lng: p.lng };
      const sel = document.getElementById('selectedPlace');
      sel.style.display = 'block';
      sel.textContent = `📍 ${p.name} (${p.address || ''})`;
    } catch (e) { /* 잘못된 값이면 무시 */ }
  }
  // 캘린더의 "＋ 이 날의 기억 남기기" -> 날짜 미리 입력
  const prefillDate = sessionStorage.getItem('prefillDate');
  if (prefillDate) {
    sessionStorage.removeItem('prefillDate');
    document.getElementById('diaryDate').value = prefillDate;
  }

  // 장소 검색을 위해 카카오 SDK 로딩 (지도는 안 그리고 검색만 사용)
  try {
    await loadKakao();
    placesService = new kakao.maps.services.Places();
  } catch (err) {
    document.getElementById('formErr').textContent = err.message;
  }
})();

// ---------- 사진: 예쁜 버튼 + 미리보기 ----------
const photoInput = document.getElementById('photo');
document.getElementById('photoBtn').onclick = () => photoInput.click(); // 숨겨둔 진짜 input을 대신 눌러 줌

photoInput.onchange = () => {
  const file = photoInput.files[0];
  const preview = document.getElementById('photoPreview');
  const nameEl = document.getElementById('photoName');
  if (!file) { preview.style.display = 'none'; nameEl.textContent = '선택된 사진 없음'; return; }

  // 사진(이미지)만 허용 — 다른 파일이면 되돌림
  if (!file.type.startsWith('image/')) {
    photoInput.value = '';
    document.getElementById('formErr').textContent = '사진(이미지 파일)만 넣을 수 있어요.';
    return;
  }
  // 5MB 초과는 서버가 받지 않으므로 여기서 미리 알려 줌 (조용히 누락되는 것 방지)
  if (file.size > 5 * 1024 * 1024) {
    photoInput.value = '';
    document.getElementById('formErr').textContent = '사진은 5MB 이하만 올릴 수 있어요. (현재 ' + (file.size / 1024 / 1024).toFixed(1) + 'MB)';
    return;
  }
  document.getElementById('formErr').textContent = '';
  nameEl.textContent = file.name;

  // 선택한 사진을 바로 미리보기로 보여 줌
  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('photoImg').src = e.target.result;
    preview.style.display = 'block';
  };
  reader.readAsDataURL(file);
};

// ✕ 버튼: 사진 빼기
document.getElementById('photoDel').onclick = () => {
  photoInput.value = '';
  document.getElementById('photoPreview').style.display = 'none';
  document.getElementById('photoName').textContent = '선택된 사진 없음';
};

// ---------- 장소 검색 ----------
document.getElementById('searchBtn').onclick = searchPlace;
// 엔터 키로도 검색되게 (폼 제출은 막음)
document.getElementById('placeQuery').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); searchPlace(); }
});

function searchPlace() {
  const query = document.getElementById('placeQuery').value.trim();
  const box = document.getElementById('placeResults');
  if (!query || !placesService) return;

  placesService.keywordSearch(query, (results, status) => {
    if (status !== kakao.maps.services.Status.OK) {
      box.style.display = 'block';
      box.innerHTML = '<div>검색 결과가 없습니다.</div>';
      return;
    }
    box.style.display = 'block';
    // 상위 7개만 보여 줌
    box.innerHTML = results.slice(0, 7).map((r, i) => `
      <div data-i="${i}">${r.place_name}<span class="p-addr">${r.road_address_name || r.address_name}</span></div>
    `).join('');

    // 결과 클릭 -> 장소 선택
    box.querySelectorAll('div[data-i]').forEach((el) => {
      el.onclick = () => {
        const r = results[Number(el.dataset.i)];
        selectedPlace = {
          name: r.place_name,
          address: r.road_address_name || r.address_name,
          lat: Number(r.y), // 카카오는 y가 위도, x가 경도
          lng: Number(r.x),
        };
        box.style.display = 'none';
        const sel = document.getElementById('selectedPlace');
        sel.style.display = 'block';
        sel.textContent = `📍 ${selectedPlace.name} (${selectedPlace.address})`;
      };
    });
  });
}

// ---------- 음악 미리보기 ----------
document.getElementById('musicBtn').onclick = async () => {
  const url = document.getElementById('musicUrl').value.trim();
  const err = document.getElementById('formErr');
  err.textContent = '';
  if (!url) return;

  try {
    // 서버가 대신 oEmbed를 호출해서 제목/표지를 가져다 줌
    musicInfo = await api('/api/diaries/oembed?url=' + encodeURIComponent(url));
    const box = document.getElementById('musicPreview');
    box.style.display = 'flex';
    document.getElementById('musicThumb').src = musicInfo.thumbnail || '';
    document.getElementById('musicTitle').textContent = musicInfo.title;
  } catch (e) {
    musicInfo = null;
    err.textContent = e.message;
  }
};

// ---------- 저장 ----------
document.getElementById('writeForm').onsubmit = async (e) => {
  e.preventDefault();
  const err = document.getElementById('formErr');
  const btn = document.getElementById('submitBtn');
  err.textContent = '';

  if (!selectedPlace) { err.textContent = '장소를 검색해서 선택해 주세요.'; return; }

  // 사진 파일이 있을 수 있어서 FormData(폼 데이터) 형식으로 전송
  const fd = new FormData();
  fd.append('place_name', selectedPlace.name);
  fd.append('address', selectedPlace.address || '');
  fd.append('lat', selectedPlace.lat);
  fd.append('lng', selectedPlace.lng);
  fd.append('diary_date', document.getElementById('diaryDate').value);
  fd.append('content', document.getElementById('content').value);

  const photo = document.getElementById('photo').files[0];
  if (photo) fd.append('photo', photo);

  const musicUrl = document.getElementById('musicUrl').value.trim();
  if (musicUrl && musicInfo) {
    fd.append('music_url', musicUrl);
    fd.append('music_title', musicInfo.title);
    fd.append('music_thumbnail', musicInfo.thumbnail || '');
  }

  btn.disabled = true;
  btn.textContent = 'AI가 감정을 읽는 중...';

  // 결과 카드 자리에 물결 연출을 먼저 보여 줌
  const card = document.getElementById('resultCard');
  card.style.display = 'block';
  card.innerHTML = aiLoaderHTML('AI가 이 기억의 감정을 읽고 있어요');
  card.scrollIntoView({ behavior: 'smooth' });

  try {
    // 응답이 빨라도 최소 1.2초는 연출 유지
    const [saved] = await Promise.all([
      api('/api/diaries', { method: 'POST', body: fd }),
      sleep(1200),
    ]);
    showResultCard(saved);

    document.getElementById('writeForm').reset();
    selectedPlace = null;
    musicInfo = null;
    document.getElementById('selectedPlace').style.display = 'none';
    document.getElementById('musicPreview').style.display = 'none';
    document.getElementById('photoPreview').style.display = 'none';
    document.getElementById('photoName').textContent = '선택된 사진 없음';
    document.getElementById('diaryDate').value = new Date().toISOString().slice(0, 10);
  } catch (e2) {
    err.textContent = e2.message;
    card.style.display = 'none'; // 실패하면 연출 카드 숨김
  } finally {
    btn.disabled = false;
    btn.textContent = '기억으로 남기기 ✎';
  }
};

// ---------- 저장 결과 카드: AI의 판단을 그 자리에서 바로 수정 가능 ----------
function showResultCard(saved) {
  const card = document.getElementById('resultCard');
  card.style.display = 'block';
  card.innerHTML = `
    <p class="hint">${saved.fromAI
      ? 'AI가 이 기억을 이렇게 읽었어요 — 마음에 안 들면 바로 고치세요'
      : 'AI 분석에 실패해 기본값으로 저장했어요 — 직접 고칠 수 있어요'}</p>
    <div id="resFace" style="display:flex; justify-content:center; margin:14px 0;">${faceSVG(saved.emotion, 72, 0)}</div>
    <input id="resTitle" value="${esc(saved.ai_title)}">
    <div style="display:flex; gap:8px; justify-content:center; margin-top:12px; flex-wrap:wrap;">
      <select id="resEmo" style="width:auto;">
        ${EMOTION_LIST.map((e) => `<option ${e === saved.emotion ? 'selected' : ''}>${e}</option>`).join('')}
      </select>
      <button class="btn" id="resSave">수정 저장</button>
      <a class="btn main" href="/index.html">지도에서 보기</a>
    </div>
    <p class="hint" id="resMsg" style="margin-top:10px;"></p>
  `;
  card.scrollIntoView({ behavior: 'smooth' });

  // 감정을 바꾸면 얼굴 미리보기도 바로 바뀜
  document.getElementById('resEmo').onchange = function () {
    document.getElementById('resFace').innerHTML = faceSVG(this.value, 72, 0);
  };

  // 수정 저장: 제목 + 감정을 한 번의 PUT으로 반영
  document.getElementById('resSave').onclick = async () => {
    const ai_title = document.getElementById('resTitle').value.trim();
    const emotion = document.getElementById('resEmo').value;
    try {
      await api(`/api/diaries/${saved.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ai_title, emotion }),
      });
      document.getElementById('resMsg').textContent = '수정했어요! 지도와 달력에 바로 반영됩니다.';
    } catch (e) {
      document.getElementById('resMsg').textContent = e.message;
    }
  };
}
