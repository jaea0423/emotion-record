// map.js - 지도 메인 페이지: 표정 스티커 마커, 이 곳의 기억, 일기 상세 + 수정
let map, clusterer, diaries = [], places = {};
const markerPlace = new Map(); // 마커 -> 장소 데이터 (클러스터의 대표 감정 계산용)
let lastClusterMarkers = null;   // 마지막으로 클릭한 묶음 (상세에서 "뒤로" 갈 때 사용)
let lastClusterKeys = null;      // 그 묶음에 속한 장소 key 목록 (수정 저장 후 마커가 새로 그려져도 같은 묶음을 복원)
let emotionFilter = null;        // 왼쪽 목록에서 고른 감정 (null이면 전체 표시)
let keywordFilter = null;        // 왼쪽 목록에서 고른 키워드 (null이면 전체 표시)
const markerSize = new Map();    // 마커 -> 픽셀 크기 (겹침 판정용)
let firstLoad = true; // 처음 한 번만 지도 위치를 자동으로 잡기 위한 플래그
let selOverlay = null; // 선택된 마커 위에 띄우는 강조 오버레이 (검정 테두리 + 둥둥)
let hiddenMarkers = []; // 둥둥 강조 아래에 깔린 '원래 마커'들 (잠시 숨겼다가 강조 해제 시 되돌림)

// 모바일(좁은 화면)에서는 마커/마커뭉치/강조를 2/3 크기로 줄인다 (데스크톱은 1 = 그대로)
const MK = window.matchMedia('(max-width: 700px)').matches ? 2 / 3 : 1;

// ---------- 시작 ----------
(async function init() {
  await renderNav('map');
  showPlaceholder(); // 시작 화면: 안내 문구

  // 키워드 페이지에서 "#키워드"를 누르고 넘어온 경우 필터를 이어받음
  const jump = sessionStorage.getItem('jumpKeyword');
  if (jump) {
    keywordFilter = jump;
    sessionStorage.removeItem('jumpKeyword');
  }

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

  // 최대 축소 제한: 레벨 12 = 축척 32km (한반도가 화면에 꽉 차는 정도)
  map.setMaxLevel(12);

  // 이동 범위 제한: "화면에 보이는 영역"이 한국 영토 박스를 못 벗어나게
  // (중심점이 아니라 화면 가장자리 기준이라, 어느 확대 단계에서든 빈 바다로 못 나감)
  // 박스: 백령도~독도(경도 123.9~132.3), 마라도~휴전선 위(위도 32.6~39.2)
  const MAXB = { sw: { lat: 32.6, lng: 123.9 }, ne: { lat: 39.2, lng: 132.3 } };
  function clampView() {
    const b = map.getBounds();
    const sw = b.getSouthWest(), ne = b.getNorthEast();
    const c = map.getCenter();
    const halfH = (ne.getLat() - sw.getLat()) / 2; // 화면 세로 절반 (도 단위)
    const halfW = (ne.getLng() - sw.getLng()) / 2; // 화면 가로 절반

    // 중심이 움직일 수 있는 허용 범위 = 박스 안쪽으로 화면 절반만큼 들어온 곳
    const latMin = MAXB.sw.lat + halfH, latMax = MAXB.ne.lat - halfH;
    const lngMin = MAXB.sw.lng + halfW, lngMax = MAXB.ne.lng - halfW;

    // 화면이 박스보다 크면(끝까지 축소한 상태) 박스 한가운데에 고정
    const lat = latMin > latMax ? (MAXB.sw.lat + MAXB.ne.lat) / 2 : Math.max(latMin, Math.min(latMax, c.getLat()));
    const lng = lngMin > lngMax ? (MAXB.sw.lng + MAXB.ne.lng) / 2 : Math.max(lngMin, Math.min(lngMax, c.getLng()));

    if (lat !== c.getLat() || lng !== c.getLng()) map.setCenter(new kakao.maps.LatLng(lat, lng));
  }
  kakao.maps.event.addListener(map, 'center_changed', clampView); // 드래그 중에도
  kakao.maps.event.addListener(map, 'zoom_changed', clampView);   // 확대/축소 직후에도
  // 확대/축소하면 클러스터가 다시 묶이면서 마커 배치가 바뀜 -> 선택 강조는 거둠
  // (강조 마커만 옛 자리에 둥둥 떠 있는 어색함 방지. 패널은 그대로 열려 있음)
  kakao.maps.event.addListener(map, 'zoom_start', clearHighlight);

  // 클러스터러: 지도를 축소하면 가까운 마커들을 하나로 합침.
  // 단, 기본 모양(숫자만 있는 원)은 쓰지 않고, 아래 'clustered' 이벤트에서
  // "대표 감정 표정 + 개수 뱃지"로 바꿔치기함 -> 숫자만 보이는 경우가 없음
  clusterer = new kakao.maps.MarkerClusterer({
    map,
    averageCenter: true,
    minLevel: 1,   // 모든 확대 단계에서 동작: 겹칠 만큼 가까우면 항상 합쳐짐
    gridSize: 95,  // 이 픽셀 거리 안의 마커들을 하나로 묶음 (마커가 커서 넉넉하게)
    disableClickZoom: true, // 클릭 시 자동 확대 끄기 (대신 아래에서 기억 목록을 보여 줌)
  });

  // 묶음(클러스터)을 클릭하면 그 안의 모든 기억 목록을 패널로 보여 줌
  kakao.maps.event.addListener(clusterer, 'clusterclick', (cluster) => {
    showCluster(cluster.getMarkers());
  });

  // 클러스터가 만들어질 때마다 내용물을 표정 스티커로 교체
  kakao.maps.event.addListener(clusterer, 'clustered', (clusters) => {
    for (const c of clusters) {
      // 이 묶음에 합쳐진 모든 장소의 일기를 모아서 대표 감정을 계산
      // (빈도 우선, 동률이면 EMOTION_PRIORITY 순서 = 긍정 우선)
      const clusterMarkers = c.getMarkers();
      const list = clusterMarkers.flatMap((m) => (markerPlace.get(m) || { list: [] }).list);
      if (!list.length) continue;
      const emo = dominantEmotion(list);
      const size = Math.round(Math.min(80 + list.length * 6, 140) * MK); // 일기가 많을수록 큰 표정 (모바일은 2/3)

      // HTML 문자열 대신 실제 요소를 만들어서 클릭 이벤트를 "직접" 단다.
      // (setContent로 내용물을 갈아끼우면 카카오가 달아 둔 클릭 처리가
      //  사라지는 경우가 있어서, 어떤 묶음은 클릭이 안 되는 문제가 있었음)
      const el = document.createElement('div');
      el.style.cssText = 'cursor:pointer; filter:drop-shadow(2px 3px 3px rgba(0,0,0,.25));';
      el.innerHTML = faceSVG(emo, size, list.length);
      el.onclick = (e) => { e.stopPropagation(); showCluster(clusterMarkers); };
      const cm = c.getClusterMarker();
      cm.setContent(el);
      // 겹칠 때 일기 개수가 많은 묶음이 위로 오게 (z축 우선순위)
      if (cm.setZIndex) cm.setZIndex(list.length);
    }
  });

  // ----- 레이아웃: 오른쪽 패널은 지도 위에 덮이는 오버레이(접기 가능), 감정 목록은 좌측 중앙에 떠 있음 -----
  // 창 크기가 바뀌면 지도만 다시 맞춰 줌
  window.addEventListener('resize', () => { if (map) map.relayout(); });

  await loadDiaries();

  // 지도 진입 시 패널은 기본 접힘. 마커를 누르거나 토글을 열면 펼쳐짐.
  showPlaceholder();       // 펼쳤을 때 보일 안내 문구 미리 준비
  setPanelCollapsed(true); // 기본 접힘

  // (시작 위치는 loadDiaries가 잡아 둔 "마지막 기록 위치" 기준
  //  -- 데스크톱 위치 API는 IP 기반이라 부정확해서 쓰지 않음)

  // 캘린더에서 "?diary=ID" 로 넘어온 경우: 그 일기 위치로 최대 확대해서 바로 열어 줌
  // (한 개에 매칭되는 거라 끝까지 확대해도 됨)
  const diaryId = new URLSearchParams(location.search).get('diary');
  if (diaryId) {
    const d = diaries.find((x) => x.id == diaryId);
    if (d) {
      firstLoad = false;
      map.setCenter(new kakao.maps.LatLng(d.lat, d.lng));
      map.setLevel(1); // 최대 확대
      showDetail(d);
    }
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
  const periodVisible = filterDiaries(diaries); // 기간 필터 적용 (common.js)
  renderEmotionPanel(periodVisible); // 왼쪽 감정 목록 갱신 (개수는 기간 기준)

  // 감정/키워드 필터: 왼쪽 패널에서 고른 것만 지도에 표시 (둘 다 고르면 둘 다 만족해야 함)
  let visible = emotionFilter
    ? periodVisible.filter((d) => d.emotion === emotionFilter)
    : periodVisible;
  if (keywordFilter) {
    visible = visible.filter((d) => (d.keywords || '').split(',').includes(keywordFilter));
  }

  // 같은 장소의 일기들을 하나로 묶기 (장소명 + 좌표 4자리 반올림을 키로 사용)
  places = {};
  for (const d of visible) {
    const key = d.place_name + '|' + d.lat.toFixed(4) + '|' + d.lng.toFixed(4);
    if (!places[key]) places[key] = { key, name: d.place_name, address: d.address, lat: d.lat, lng: d.lng, list: [] };
    places[key].list.push(d);
  }

  // 이전에 그려 둔 마커들을 먼저 지움 (필터 변경/수정 후 다시 그릴 때)
  clearHighlight();
  clusterer.clear();
  markerPlace.clear();
  markerSize.clear();
  const markers = [];

  for (const key in places) {
    const p = places[key];
    const emotion = dominantEmotion(p.list); // 대표 감정 (가장 많이 나온 것)
    const size = Math.round(Math.min(72 + p.list.length * 10, 130) * MK); // 일기가 많을수록 큰 마커 (최대 130px, 모바일은 2/3)

    // 표정 스티커 SVG를 마커 이미지로 사용 (faceSVG는 common.js)
    // 일기가 2개 이상이면 숫자 뱃지가 같이 그려짐
    const svg = faceSVG(emotion, size, p.list.length);
    const image = new kakao.maps.MarkerImage(
      'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg),
      new kakao.maps.Size(size, size),
      { offset: new kakao.maps.Point(size / 2, size / 2) }
    );

    const pos = new kakao.maps.LatLng(p.lat, p.lng);
    // 일기 개수가 많을수록 z-index를 높여서, 겹칠 때 큰(많은) 마커가 위로 오게
    const marker = new kakao.maps.Marker({ position: pos, image, title: p.name, zIndex: p.list.length });
    // 클릭하면 화면에서 겹쳐 있는 마커들을 찾아 같이 보여 줌
    kakao.maps.event.addListener(marker, 'click', () => handleMarkerClick(marker));

    markerPlace.set(marker, p); // 클러스터 표정 계산을 위해 기억해 둠
    markerSize.set(marker, size); // 겹침 판정용
    markers.push(marker);
  }

  clusterer.addMarkers(markers); // 한꺼번에 올리면 클러스터러가 알아서 합쳐 줌

  // 처음 들어왔을 때: 가장 최근 일기가 있는 곳을 중심으로 확대해서 시작
  // (전체 기록 범위로 맞추면 전국이 다 보일 만큼 축소돼서 허전해 보임)
  if (visible.length > 0) {
    if (firstLoad) {
      const latest = visible[0]; // API가 최신순으로 정렬해서 보내 줌
      map.setCenter(new kakao.maps.LatLng(latest.lat, latest.lng));
      map.setLevel(6); // 동네가 보이는 정도의 확대
      firstLoad = false;
    }
  } else {
    showEmpty(diaries.length > 0);
  }
}

// ---------- 마커 클릭: 겹쳐 있으면 함께 보여 주기 ----------
// 마커가 커서 서로 겹치면 아래 깔린 마커는 클릭이 안 됨.
// 그래서 클릭된 마커와 화면상(픽셀 기준) 겹쳐 있는 마커들을 찾아
// 하나라도 있으면 그 기억들을 전부 시간순으로 합쳐서 보여 줌.
function handleMarkerClick(clicked) {
  clearHighlight(); // 이전 강조로 숨겨 둔 마커들을 먼저 되돌려야 겹침 판정이 정확함
  const proj = map.getProjection(); // 좌표(위도/경도) -> 화면 픽셀 변환기
  const cp = proj.containerPointFromCoords(clicked.getPosition());
  const cr = (markerSize.get(clicked) || 50) / 2; // 클릭된 마커의 반지름

  const group = [];
  for (const [m] of markerPlace) {
    if (m !== clicked && !m.getMap()) continue; // 클러스터에 숨겨진 마커는 제외
    const p2 = proj.containerPointFromCoords(m.getPosition());
    const r2 = (markerSize.get(m) || 50) / 2;
    const dist = Math.hypot(cp.x - p2.x, cp.y - p2.y); // 두 마커 중심 사이 픽셀 거리
    if (dist < (cr + r2) * 0.8) group.push(m); // 반지름 합의 80% 안이면 "겹침"
  }

  if (group.length <= 1) showPlace(markerPlace.get(clicked).key); // 안 겹치면 평소처럼
  else showCluster(group); // 겹치면 합쳐서 보여 줌
}

// ---------- 사이드 패널: 묶음(클러스터) 안의 기억들 ----------
function showCluster(clusterMarkers) {
  lastClusterMarkers = clusterMarkers;
  const placeList = clusterMarkers.map((m) => markerPlace.get(m)).filter(Boolean);
  const list = placeList.flatMap((p) => p.list);
  if (!list.length) return closePanel();
  lastClusterKeys = placeList.map((p) => p.key); // 묶음 식별용 (수정 저장 후 복원)
  document.querySelector('.map-layout')?.classList.add('panel-open'); // 좁은 화면: 슬라이드 인
  if (document.body.classList.contains('panel-collapsed')) setPanelCollapsed(false); // 접혀 있으면 펼침
  drawClusterHighlight(clusterMarkers); // 묶음 중심에 둥둥 강조 + 원래 마커 숨김
  // 이야기(AI)는 시간순(흐름), 목록 표시는 최신이 위로
  const chrono = [...list].sort((a, b) => a.diary_date.localeCompare(b.diary_date) || a.id - b.id);
  const display = [...chrono].reverse();

  const body = document.getElementById('panelBody');
  body.innerHTML = `
    <h2>이 근처의 기억</h2>
    <p class="addr">장소 ${placeList.length}곳 · 기억 ${list.length}개</p>
    <button class="btn ai-btn" style="width:100%;" id="storyBtn">✨ AI가 들려주는 이 곳들의 이야기</button>
    <div class="ai-story" id="storyBox" style="display:none;"></div>
    ${display.map((d) => `
      <div class="diary-item" data-id="${d.id}">
        <div class="d-row">
          <div class="d-face">${faceSVG(d.emotion, 46, 0)}</div>
          <div>
            <span class="d-date">${prettyDate(d.diary_date)} · ${esc(d.place_name)}</span>
            <p class="d-title">${esc(d.ai_title) || '(제목 없음)'}</p>
          </div>
        </div>
      </div>`).join('')}
  `;
  wireStory('이 근처', chrono.map((d) => d.id)); // ✨ 버튼 연결 (시간순으로 전달)
  // 일기 클릭 -> 상세 (뒤로 가면 이 목록으로 돌아옴)
  body.querySelectorAll('.diary-item').forEach((el) => {
    el.onclick = () => {
      const d = diaries.find((x) => x.id == el.dataset.id);
      showDetail(d, '__cluster__');
    };
  });
  openPanel();
}

// ---------- 사이드 패널: 이 곳의 기억 ----------
function showPlace(key) {
  const p = places[key];
  if (!p) return closePanel();
  document.querySelector('.map-layout')?.classList.add('panel-open'); // 좁은 화면: 패널 슬라이드 인
  if (document.body.classList.contains('panel-collapsed')) setPanelCollapsed(false); // 접혀 있으면 펼침
  highlightPlace(p); // 선택된 장소 마커를 검정 테두리 + 둥둥 효과로 강조
  // 이야기(AI)는 시간순(흐름), 목록 표시는 최신이 위로
  const chrono = [...p.list].sort((a, b) => a.diary_date.localeCompare(b.diary_date) || a.id - b.id);
  const display = [...chrono].reverse();

  const body = document.getElementById('panelBody');
  body.innerHTML = `
    <h2>${esc(p.name)}</h2>
    <p class="addr">${esc(p.address) || ''} · 이 곳의 기억 ${p.list.length}개</p>
    ${p.list.length >= 2 ? `<button class="btn ai-btn" style="width:100%;" id="storyBtn">✨ AI가 들려주는 이 곳의 이야기</button>` : ''}
    <div class="ai-story" id="storyBox" style="display:none;"></div>
    ${display.map((d) => `
      <div class="diary-item" data-id="${d.id}">
        <div class="d-row">
          <div class="d-face">${faceSVG(d.emotion, 46, 0)}</div>
          <div>
            <span class="d-date">${prettyDate(d.diary_date)}</span>
            <p class="d-title">${esc(d.ai_title) || '(제목 없음)'}</p>
          </div>
        </div>
      </div>`).join('')}
    <button class="btn main" style="width:100%; margin-top:12px;" id="writeHereBtn">＋ 이 곳에 새 기억 남기기</button>
  `;
  wireStory(p.name, chrono.map((d) => d.id)); // ✨ 버튼 연결 (시간순으로 전달, common.js)

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
  document.querySelector('.map-layout')?.classList.add('panel-open'); // 좁은 화면: 패널 슬라이드 인
  if (document.body.classList.contains('panel-collapsed')) setPanelCollapsed(false); // 접혀 있으면 펼침
  // 들어온 경로의 둥둥 마커(장소/근처 뭉치)를 그대로 유지.
  // 강조가 아직 없을 때(딥링크 ?diary=ID 등)만 새로 표시 -> 개별 기억을 골라도 마커가 안 바뀜
  if (!selOverlay) highlightDiary(d);
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
      <button class="back" id="backBtn">← ${backKey === '__cluster__' ? '근처의 기억으로' : backKey ? '장소의 기억으로' : '닫기'}</button>
      <span class="d-date">${prettyDate(d.diary_date)} · ${esc(d.place_name)}</span>
      <h2 style="margin-top:4px;">${esc(d.ai_title) || '(제목 없음)'}</h2>
      <span class="emo-badge" style="margin-top:10px;">${faceSVG(d.emotion, 28, 0)}${d.emotion}</span>
      ${d.keywords ? `<div class="kw-chips" style="margin-top:10px;">
        ${d.keywords.split(',').map((k) => `<button type="button" class="kw-chip" data-kw="${esc(k)}">#${esc(k)}</button>`).join('')}
      </div>` : ''}
      <p class="content">${esc(d.content)}</p>
      ${d.photo_path ? `
        <div class="polaroid"><img src="${d.photo_path}" alt="일기 사진"><div class="cap">${esc(d.place_name)}에서</div></div>` : ''}
      ${d.music_title && !musicEmbed ? `
        <div class="musicbox">
          <div class="art">${d.music_thumbnail ? `<img src="${d.music_thumbnail}" alt="">` : '♪'}</div>
          <div><div class="mt">${esc(d.music_title)}</div></div>
        </div>` : ''}
      ${musicEmbed}

      <div class="row" style="margin-top:18px;">
        <button class="btn" id="editBtn" style="flex:1;">수정</button>
        <button class="btn danger" id="delBtn" style="flex:1;">삭제</button>
      </div>
    </div>
  `;

  // 키워드 칩 클릭 -> 그 키워드로 지도 필터
  body.querySelectorAll('.detail .kw-chip').forEach((el) => {
    el.onclick = async () => {
      keywordFilter = el.dataset.kw;
      closePanel();
      await loadDiaries();
    };
  });

  // 뒤로 가기: 클러스터 목록 / 장소 목록 / 닫기
  document.getElementById('backBtn').onclick = () => {
    if (backKey === '__cluster__') return showCluster(lastClusterMarkers || []);
    backKey ? showPlace(backKey) : closePanel();
  };

  // "수정" 누르면 편집 폼으로 전환
  document.getElementById('editBtn').onclick = () => showEdit(d, backKey);

  // 삭제
  document.getElementById('delBtn').onclick = async () => {
    if (!confirm('이 기억을 삭제할까요?')) return;
    await api(`/api/diaries/${d.id}`, { method: 'DELETE' });
    closePanel();
    await loadDiaries();
  };

  openPanel();
}

// ---------- 사이드 패널: 일기 편집 (제목/감정/본문/키워드/장소/날짜) ----------
let editKw = []; // 편집 중인 키워드 목록
let editPhotoRemove = false; // 저장 시 사진을 지울지
function showEdit(d, backKey) {
  editKw = (d.keywords || '').split(',').filter(Boolean).slice(0, 5);
  editPhotoRemove = false;
  const body = document.getElementById('panelBody');
  body.innerHTML = `
    <div class="detail">
      <button class="back" id="cancelBtn">← 수정 취소</button>
      <h2 style="margin-top:4px; color:var(--accent);">기억 다듬기</h2>

      <label>장소</label>
      <input id="ePlace" value="${esc(d.place_name)}">

      <label>날짜</label>
      <input id="eDate" type="date" value="${esc(d.diary_date)}">

      <label>제목(요약)</label>
      <input id="eTitle" value="${esc(d.ai_title)}">

      <label>감정</label>
      ${emotionPickerHTML('ePick', d.emotion)}

      <label>본문</label>
      <textarea id="eContent" rows="7">${esc(d.content)}</textarea>

      <label>키워드 <span class="hint">(최대 5개)</span></label>
      <div class="kw-chips" id="eKwBox" style="margin-bottom:8px;"></div>
      <input id="eKwInput" placeholder="키워드 추가하고 Enter" style="font-size:14.5px;">

      <label>사진 <span class="hint">(최대 1장)</span></label>
      <div id="ePhotoWrap">
        <div class="photo-preview" id="ePhotoPrev" style="${d.photo_path ? '' : 'display:none;'}">
          <img id="ePhotoImg" src="${d.photo_path ? esc(d.photo_path) : ''}" alt="사진">
          <button type="button" class="pp-del" id="ePhotoDel" title="사진 빼기">✕</button>
        </div>
        <input id="ePhoto" type="file" accept="image/*" hidden>
        <div class="photo-row" style="margin-top:8px;">
          <button type="button" class="btn" id="ePhotoBtn">📷 ${d.photo_path ? '사진 바꾸기' : '사진 추가'}</button>
          <span class="hint" id="ePhotoName">${d.photo_path ? '현재 사진 1장' : '선택된 사진 없음'}</span>
        </div>
      </div>

      <div class="row" style="margin-top:18px;">
        <button class="btn" id="eCancel" style="flex:1;">수정 취소</button>
        <button class="btn main" id="eSave" style="flex:2;">저장</button>
      </div>
      <p class="error" id="eErr"></p>
    </div>
  `;
  wireEmotionPicker('ePick');
  renderEditKw();

  // 키워드 직접 추가
  document.getElementById('eKwInput').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const v = e.target.value.replace(/^#/, '').trim().slice(0, 12);
    if (!v || editKw.includes(v) || editKw.length >= 5) { e.target.value = ''; return; }
    editKw.push(v); e.target.value = ''; renderEditKw();
  });

  document.getElementById('cancelBtn').onclick = () => showDetail(d, backKey);
  document.getElementById('eCancel').onclick = () => showDetail(d, backKey);

  // ----- 사진 추가/교체/삭제 (최대 1장) -----
  const ePhoto = document.getElementById('ePhoto');
  const ePrev = document.getElementById('ePhotoPrev');
  const eImg = document.getElementById('ePhotoImg');
  document.getElementById('ePhotoBtn').onclick = () => ePhoto.click();
  ePhoto.onchange = () => {
    const f = ePhoto.files[0];
    if (!f) return;
    editPhotoRemove = false;
    eImg.src = URL.createObjectURL(f); // 새 사진 미리보기
    ePrev.style.display = '';
    document.getElementById('ePhotoName').textContent = '새 사진 1장 (저장하면 적용)';
    document.getElementById('ePhotoBtn').textContent = '📷 사진 바꾸기';
  };
  document.getElementById('ePhotoDel').onclick = () => {
    ePhoto.value = '';
    eImg.src = '';
    ePrev.style.display = 'none';
    editPhotoRemove = true; // 저장하면 사진 삭제
    document.getElementById('ePhotoName').textContent = '사진 없음 (저장하면 삭제)';
    document.getElementById('ePhotoBtn').textContent = '📷 사진 추가';
  };

  // 저장: 바뀐 항목 전부 PUT (사진이 있을 수 있어 FormData로 전송)
  document.getElementById('eSave').onclick = async () => {
    const fd = new FormData();
    fd.append('place_name', document.getElementById('ePlace').value.trim());
    fd.append('diary_date', document.getElementById('eDate').value);
    fd.append('ai_title', document.getElementById('eTitle').value.trim());
    fd.append('emotion', getEmotionPick('ePick'));
    fd.append('content', document.getElementById('eContent').value.trim());
    fd.append('keywords', editKw.join(','));
    const f = ePhoto.files[0];
    if (f) fd.append('photo', f);            // 새 사진 추가/교체
    else if (editPhotoRemove) fd.append('remove_photo', '1'); // 기존 사진 삭제
    try {
      await api(`/api/diaries/${d.id}`, { method: 'PUT', body: fd }); // Content-Type은 브라우저가 자동 설정
      await loadDiaries(); // 마커/목록 갱신 (clearHighlight로 둥둥 강조도 지워짐)
      const updated = diaries.find((x) => x.id == d.id);
      // 묶음(클러스터)으로 들어왔다면, 새로 그려진 마커 중 같은 묶음을 찾아 둥둥 강조를 복원
      // (안 하면 showDetail이 단일 장소로 다시 강조해서, 들어왔던 묶음 대신 작은 마커가 떠 버림)
      if (backKey === '__cluster__' && lastClusterKeys && lastClusterKeys.length) {
        const fresh = [];
        for (const [m, p] of markerPlace) if (lastClusterKeys.includes(p.key)) fresh.push(m);
        if (fresh.length) { lastClusterMarkers = fresh; drawClusterHighlight(fresh); }
      }
      showDetail(updated || d, backKey); // selOverlay가 이미 있으면 showDetail이 다시 강조하지 않음
    } catch (e) {
      document.getElementById('eErr').textContent = e.message;
    }
  };
}

// 편집 화면의 키워드 칩 다시 그림 (✕로 제거)
function renderEditKw() {
  const box = document.getElementById('eKwBox');
  if (!box) return;
  box.innerHTML = editKw.length
    ? editKw.map((k, i) => `<button type="button" class="kw-chip" data-i="${i}">#${esc(k)} ✕</button>`).join('')
    : '<span class="hint">키워드 없음</span>';
  box.querySelectorAll('.kw-chip').forEach((el) => {
    el.onclick = () => { editKw.splice(Number(el.dataset.i), 1); renderEditKw(); };
  });
}

// ---------- 선택된 마커 강조 (검정 테두리 + 둥둥 떠다니기) ----------
// 묶음(클러스터) 중심에 둥둥 강조 + 묶음에 속한 원래 마커들을 숨김
function drawClusterHighlight(group) {
  const placeList = group.map((m) => markerPlace.get(m)).filter(Boolean);
  if (!placeList.length) return;
  const list = placeList.flatMap((p) => p.list);
  const avgLat = placeList.reduce((a, p) => a + p.lat, 0) / placeList.length;
  const avgLng = placeList.reduce((a, p) => a + p.lng, 0) / placeList.length;
  const size = Math.round(Math.min(80 + list.length * 6, 140) * MK);
  showHighlightAt(avgLat, avgLng, dominantEmotion(list), list.length, size);
  hideBaseMarkers(group); // 둥둥 강조 뒤로 원래 마커가 비치지 않게
}
function highlightPlace(p) {
  const emo = dominantEmotion(p.list);
  const size = Math.round(Math.min(72 + p.list.length * 10, 130) * MK); // 마커와 같은 크기
  showHighlightAt(p.lat, p.lng, emo, p.list.length, size);
  // 이 장소의 원래 마커를 숨김 (둥둥 떠오를 때 뒤에 비치지 않게)
  for (const [m, pl] of markerPlace) { if (pl === p) { hideBaseMarkers([m]); break; } }
}
function highlightDiary(d) {
  // 같은 좌표(소수 4자리)의 장소를 찾아 그 마커를 강조
  const key = d.place_name + '|' + d.lat.toFixed(4) + '|' + d.lng.toFixed(4);
  const p = places[key];
  if (p) highlightPlace(p);
  else showHighlightAt(d.lat, d.lng, d.emotion, 1, Math.round(80 * MK)); // 필터 등으로 마커가 없으면 일기 자체로
}
function showHighlightAt(lat, lng, emotion, count, size) {
  if (!map) return;
  clearHighlight();
  const el = document.createElement('div');
  el.className = 'sel-marker';
  // 테두리 = 그 마커의 감정 색 / 살짝 크게 그려서 아래 깔린 원래 마커를 가림
  el.innerHTML = faceSVG(emotion, Math.round(size * 1.2), count, emotionColor(emotion));
  selOverlay = new kakao.maps.CustomOverlay({
    position: new kakao.maps.LatLng(lat, lng),
    content: el,
    zIndex: 10000, // 항상 맨 위
    yAnchor: 0.5, xAnchor: 0.5,
  });
  selOverlay.setMap(map);
}
// 둥둥 강조가 떠오를 때 그 자리의 원래(일반) 마커가 뒤로 비치지 않도록 잠시 숨김
function hideBaseMarkers(markers) {
  markers.forEach((m) => { if (m && m.getMap()) { m.setMap(null); hiddenMarkers.push(m); } });
}
function clearHighlight() {
  if (selOverlay) { selOverlay.setMap(null); selOverlay = null; }
  if (hiddenMarkers.length) { hiddenMarkers.forEach((m) => m.setMap(map)); hiddenMarkers = []; } // 숨겼던 마커 복원
}

// ---------- 패널 (항상 열려 있음) ----------
// "닫기"는 패널을 없애는 대신 안내 문구 상태로 되돌림
function openPanel() { map && map.relayout(); }
function closePanel() { showPlaceholder(); }
document.getElementById('panelClose').onclick = closePanel;

// 오른쪽 패널 접기/펼치기: body 클래스만 토글하면 --panel-w가 0이 되어
// 패널 폭 + 로고/독/코너 정렬 + 지도 영역이 한꺼번에 따라 움직임 (CSS transition)
function setPanelCollapsed(collapsed) {
  document.body.classList.toggle('panel-collapsed', collapsed);
  const t = document.getElementById('panelToggle');
  if (t) t.textContent = collapsed ? '‹' : '›'; // 접힘이면 펼치기(‹), 펼침이면 접기(›)
  setTimeout(() => { if (map) map.relayout(); }, 320); // 애니메이션 끝난 뒤 지도만 재계산
}
const _panelToggle = document.getElementById('panelToggle');
if (_panelToggle) {
  _panelToggle.onclick = () => setPanelCollapsed(!document.body.classList.contains('panel-collapsed'));
}

// 아무것도 안 눌렀을 때 보여 주는 안내 문구
function showPlaceholder() {
  document.querySelector('.map-layout')?.classList.remove('panel-open'); // 좁은 화면: 패널 닫힘
  clearHighlight();
  document.getElementById('panelBody').innerHTML = `
    <div class="panel-placeholder">
      <div class="pp-face">${faceSVG('기쁨', 64, 0)}</div>
      <p>지도에서 감정을 클릭해 보세요</p>
      <span class="hint">장소마다 쌓인 기억들이 여기에 나타나요</span>
    </div>`;
}

// 왼쪽 고정 패널: 감정 목록 + (현재 기간의) 기억 개수
// 감정을 클릭하면 그 감정의 마커만 지도에 표시 (다시 클릭하면 해제)
function renderEmotionPanel(visible) {
  const counts = {};
  for (const d of visible) counts[d.emotion] = (counts[d.emotion] || 0) + 1;
  const box = document.getElementById('emotionList');
  box.innerHTML = `
    ${EMOTION_LIST.map((e) => `
      <div class="el-row ${emotionFilter === e ? 'on' : ''}" data-emo="${e}" title="${e} 기억만 보기">
        ${faceSVG(e, 22, 0)}
        <span class="el-name">${e}</span>
        <span class="el-cnt">${counts[e] || 0}</span>
      </div>`).join('')}`;

  box.querySelectorAll('.el-row').forEach((el) => {
    el.onclick = async () => {
      const emo = el.dataset.emo;
      emotionFilter = (emotionFilter === emo) ? null : emo; // 같은 걸 또 누르면 해제
      closePanel();
      await loadDiaries(); // 마커 + 목록 강조 다시 그림
    };
  });

  // ----- 키워드 필터가 걸려 있으면 맨 위에 "#키워드 ✕" 칩 표시 (누르면 해제) -----
  if (keywordFilter) {
    const fl = document.createElement('div');
    fl.style.margin = '0 0 14px';
    fl.innerHTML = `<button type="button" class="kw-chip on" id="kwClear">#${esc(keywordFilter)} 필터 중 ✕</button>`;
    box.prepend(fl);
    document.getElementById('kwClear').onclick = async () => {
      keywordFilter = null;
      closePanel();
      await loadDiaries();
    };
  }
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
