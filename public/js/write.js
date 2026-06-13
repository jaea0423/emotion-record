// write.js - 기록 페이지: 2단계 흐름
//  1단계 [✨ AI와 함께 정리하기] -> AI가 제목/감정/키워드를 "제안" (아직 저장 아님)
//  2단계 제안을 그대로 두거나 고친 뒤 [기록으로 남기기] -> 저장하고 지도로 이동
let selectedPlace = null; // 검색에서 고른 장소 {name, address, lat, lng}
let musicInfo = null;     // oEmbed로 가져온 곡 정보 {title, thumbnail}
let placesService = null; // 카카오 장소 검색 객체
let proposal = null;      // AI 제안 { title, emotion, keywords, fromAI }
let kwList = [];          // 제안 카드에서 편집 중인 키워드 (최대 5개)
let pinMap = null;        // 핀 선택 모달의 지도
let geocoder = null;      // 좌표 -> 주소 변환기
let pinAddress = '';      // 핀 위치의 주소

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

// ---------- 지도에서 핀으로 위치 선택 ----------
const pinModal = document.getElementById('pinModal');

document.getElementById('pinBtn').onclick = () => {
  if (!placesService) {
    document.getElementById('formErr').textContent = '지도를 불러오지 못해서 핀 선택을 쓸 수 없어요.';
    return;
  }
  pinModal.style.display = 'flex';

  if (!pinMap) {
    // 처음 열 때 한 번만 지도 생성
    pinMap = new kakao.maps.Map(document.getElementById('pinMap'), {
      center: new kakao.maps.LatLng(37.5665, 126.978),
      level: 4,
    });
    geocoder = new kakao.maps.services.Geocoder();
    // 지도를 움직이다 멈출 때마다 가운데(핀) 주소를 갱신
    kakao.maps.event.addListener(pinMap, 'idle', updatePinAddress);
  }
  pinMap.relayout(); // 모달이 보인 뒤 크기 재계산 (안 하면 회색으로 나옴)

  // 시작 위치: 이미 고른 장소 > 현재 위치 > 서울시청
  if (selectedPlace) {
    pinMap.setCenter(new kakao.maps.LatLng(selectedPlace.lat, selectedPlace.lng));
  } else if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (p) => pinMap.setCenter(new kakao.maps.LatLng(p.coords.latitude, p.coords.longitude)),
      () => {}, { timeout: 4000 }
    );
  }
  updatePinAddress();
};

function updatePinAddress() {
  const c = pinMap.getCenter();
  geocoder.coord2Address(c.getLng(), c.getLat(), (res, status) => {
    const el = document.getElementById('pinAddr');
    if (status === kakao.maps.services.Status.OK && res[0]) {
      // 도로명 주소가 있으면 우선, 없으면 지번 주소
      pinAddress = (res[0].road_address && res[0].road_address.address_name)
        || (res[0].address && res[0].address.address_name) || '';
      el.textContent = '📍 ' + (pinAddress || '주소 정보 없음');
    } else {
      pinAddress = '';
      el.textContent = '주소 정보를 찾지 못했어요 (그래도 선택은 가능해요)';
    }
  });
}

document.getElementById('pinCancel').onclick = () => { pinModal.style.display = 'none'; };

document.getElementById('pinOk').onclick = () => {
  const c = pinMap.getCenter();
  const desc = document.getElementById('pinDesc').value.trim();
  // 설명이 없으면 주소를 장소 이름으로 사용
  selectedPlace = {
    name: desc || pinAddress || '이름 없는 장소',
    address: pinAddress,
    lat: c.getLat(),
    lng: c.getLng(),
  };
  const sel = document.getElementById('selectedPlace');
  sel.style.display = 'block';
  // 설명을 안 적어서 이름=주소면 한 번만 표시
  sel.textContent = '📍 ' + selectedPlace.name
    + (pinAddress && pinAddress !== selectedPlace.name ? ` (${pinAddress})` : '');
  document.getElementById('placeResults').style.display = 'none'; // 검색 결과 목록 닫기
  pinModal.style.display = 'none';
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
      <div data-i="${i}">${esc(r.place_name)}<span class="p-addr">${esc(r.road_address_name || r.address_name)}</span></div>
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

// ---------- 1단계: AI에게 정리 제안 받기 (저장 아님) ----------
document.getElementById('writeForm').onsubmit = async (e) => {
  e.preventDefault();
  const err = document.getElementById('formErr');
  const btn = document.getElementById('submitBtn');
  err.textContent = '';

  const content = document.getElementById('content').value;
  if (!selectedPlace) { err.textContent = '장소를 검색해서 선택해 주세요.'; return; }
  if (!document.getElementById('diaryDate').value) { err.textContent = '날짜를 선택해 주세요.'; return; }
  if (content.trim().length < 5) { err.textContent = '일기를 5자 이상 적어 주세요.'; return; }

  btn.disabled = true;

  // 제안 카드 자리에 물결 연출
  const card = document.getElementById('resultCard');
  card.style.display = 'block';
  card.innerHTML = aiLoaderHTML('AI가 이 기록을 읽고 있어요');
  card.scrollIntoView({ behavior: 'smooth' });

  try {
    // 응답이 빨라도 최소 1.2초는 연출 유지
    const [ai] = await Promise.all([
      api('/api/diaries/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      }),
      sleep(1200),
    ]);
    proposal = ai;
    showProposal(ai);
  } catch (e2) {
    err.textContent = e2.message;
    card.style.display = 'none';
  } finally {
    btn.disabled = false;
  }
};

// ---------- 2단계: 제안 확인/수정 -> 기록으로 남기기 ----------
function showProposal(ai) {
  const card = document.getElementById('resultCard');
  card.innerHTML = `
    <p class="hint">${ai.fromAI
      ? 'AI가 이렇게 정리했어요 — 그대로 남기거나, 고쳐서 남겨 주세요'
      : 'AI 분석에 실패했어요 — 직접 정리해서 남겨 주세요'}</p>
    <div id="resFace" style="display:flex; justify-content:center; margin:14px 0;">${faceSVG(ai.emotion, 72, 0)}</div>
    <input id="resTitle" value="${esc(ai.title)}">
    <div style="display:flex; gap:8px; justify-content:center; margin-top:12px; flex-wrap:wrap;">
      ${emotionPickerHTML('resEmo', ai.emotion)}
    </div>
    <div class="kw-chips" id="kwEdit" style="justify-content:center; margin-top:14px;"></div>
    <input id="kwInput" placeholder="키워드 직접 추가하고 Enter (최대 5개)"
      style="max-width:300px; margin:10px auto 0; font-size:14.5px; font-weight:400; text-align:center;">
    <button class="btn main" style="width:100%; margin-top:20px;" id="saveBtn">기록으로 남기기</button>
    <p class="error" id="saveErr"></p>
  `;
  card.scrollIntoView({ behavior: 'smooth' });

  // 감정을 바꾸면 얼굴 미리보기도 바로 바뀜
  wireEmotionPicker('resEmo', (e) => {
    document.getElementById('resFace').innerHTML = faceSVG(e, 72, 0);
  });

  // ----- 키워드 편집: AI 제안 + 직접 추가(✕로 빼기) -----
  kwList = (ai.keywords || []).slice(0, 5);
  renderKwChips();

  document.getElementById('kwInput').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const v = e.target.value.replace(/^#/, '').trim().slice(0, 12);
    if (!v) return;
    if (kwList.includes(v)) { e.target.value = ''; return; } // 중복 방지
    if (kwList.length >= 5) return; // 최대 5개
    kwList.push(v);
    e.target.value = '';
    renderKwChips();
  });

  document.getElementById('saveBtn').onclick = doSave;
}

// 키워드 칩들을 다시 그림 (✕ 누르면 제거)
function renderKwChips() {
  const box = document.getElementById('kwEdit');
  if (!box) return;
  box.innerHTML = kwList.length
    ? kwList.map((k, i) => `<button type="button" class="kw-chip" data-i="${i}">#${esc(k)} ✕</button>`).join('')
    : '<span class="hint">키워드 없음 — 아래에서 직접 추가할 수 있어요</span>';
  box.querySelectorAll('.kw-chip').forEach((el) => {
    el.onclick = () => { kwList.splice(Number(el.dataset.i), 1); renderKwChips(); };
  });
}

async function doSave() {
  const saveBtn = document.getElementById('saveBtn');
  const saveErr = document.getElementById('saveErr');
  saveBtn.disabled = true;
  saveBtn.textContent = '남기는 중...';

  // 사진이 있을 수 있어서 FormData(폼 데이터) 형식으로 전송
  const fd = new FormData();
  fd.append('place_name', selectedPlace.name);
  fd.append('address', selectedPlace.address || '');
  fd.append('lat', selectedPlace.lat);
  fd.append('lng', selectedPlace.lng);
  fd.append('diary_date', document.getElementById('diaryDate').value);
  fd.append('content', document.getElementById('content').value);

  // 사용자가 확정한 제목/감정/키워드 (서버는 이 값을 그대로 저장)
  fd.append('ai_title', document.getElementById('resTitle').value.trim());
  fd.append('emotion', getEmotionPick('resEmo'));
  fd.append('keywords', kwList.join(',')); // 편집(추가/삭제)된 키워드 그대로

  const photo = photoInput.files[0];
  if (photo) fd.append('photo', photo);

  const musicUrl = document.getElementById('musicUrl').value.trim();
  if (musicUrl && musicInfo) {
    fd.append('music_url', musicUrl);
    fd.append('music_title', musicInfo.title);
    fd.append('music_thumbnail', musicInfo.thumbnail || '');
  }

  try {
    const saved = await api('/api/diaries', { method: 'POST', body: fd });
    // 저장 완료 -> 지도에서 방금 남긴 기록이 열린 상태로 이동
    location.href = '/index.html?diary=' + saved.id;
  } catch (e) {
    saveErr.textContent = e.message;
    saveBtn.disabled = false;
    saveBtn.textContent = '기록으로 남기기';
  }
}
