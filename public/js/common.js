// common.js - 모든 페이지에서 함께 쓰는 공통 코드
// (감정 색/표정, API 래퍼, 내비게이션 + 기간 필터, 카카오 SDK 로더)

// ================= 감정 데이터 =================
// 감정 -> 색상 매핑 (백엔드 ai.js의 EMOTIONS와 반드시 일치해야 함)
const EMOTION_COLORS = {
  '기쁨': '#FFD43B',
  '사랑': '#FF4757',
  '설렘': '#FF8FC8',
  '평온': '#51CF66',
  '슬픔': '#339AF0',
  '불안': '#9775FA',
  '화남': '#E8590C',
  '지침': '#8D6E63',
  '그저 그런 날': '#ADB5BD',
};
const EMOTION_LIST = Object.keys(EMOTION_COLORS);

// 감정 이름으로 색을 얻는 함수 (모르는 값이면 회색)
function emotionColor(emotion) {
  return EMOTION_COLORS[emotion] || EMOTION_COLORS['그저 그런 날'];
}

// ===== 감정별 이목구비 (viewBox -44~44 기준, 마커와 캘린더가 함께 사용) =====
const FACES = {
  '기쁨': `<path d="M -16 -6 q 6 -8 12 0" class="f"/><path d="M 4 -6 q 6 -8 12 0" class="f"/>
           <path d="M -12 8 q 12 14 24 0" class="f"/>`,
  '사랑': `<path d="M -10 -10 c -3 -6 -12 -3 -9 4 c 2 4 9 8 9 8 c 0 0 7 -4 9 -8 c 3 -7 -6 -10 -9 -4 Z" fill="#fff"/>
           <path d="M 10 -10 c -3 -6 -12 -3 -9 4 c 2 4 9 8 9 8 c 0 0 7 -4 9 -8 c 3 -7 -6 -10 -9 -4 Z" fill="#fff"/>
           <path d="M -8 12 q 8 8 16 0" stroke="#fff" stroke-width="3.5" fill="none" stroke-linecap="round"/>`,
  '설렘': `<circle cx="-10" cy="-6" r="4" class="d"/><circle cx="10" cy="-6" r="4" class="d"/>
           <circle cx="-18" cy="5" r="5.5" fill="#fff" opacity=".5"/><circle cx="18" cy="5" r="5.5" fill="#fff" opacity=".5"/>
           <path d="M -6 10 q 6 7 12 0" class="f"/>`,
  '평온': `<path d="M -16 -4 q 6 5 12 0" class="f"/><path d="M 4 -4 q 6 5 12 0" class="f"/>
           <path d="M -7 12 q 7 5 14 0" class="f"/>`,
  '슬픔': `<circle cx="-10" cy="-6" r="4" class="d"/><circle cx="10" cy="-6" r="4" class="d"/>
           <path d="M -8 14 q 8 -9 16 0" class="f"/>
           <path d="M 15 1 q 6 9 0 12 q -6 -3 0 -12" fill="#D6EBFF"/>`,
  '불안': `<path d="M -17 -14 l 11 -3" class="f"/><path d="M 17 -14 l -11 -3" class="f"/>
           <circle cx="-10" cy="-5" r="4" class="d"/><circle cx="10" cy="-5" r="4" class="d"/>
           <path d="M -11 11 q 3.5 -5 7 0 q 3.5 5 7 0 q 3.5 -5 8 0" class="f"/>`,
  '화남': `<path d="M -17 -15 l 12 6" class="f" stroke-width="4"/><path d="M 17 -15 l -12 6" class="f" stroke-width="4"/>
           <circle cx="-9" cy="-2" r="4" class="d"/><circle cx="9" cy="-2" r="4" class="d"/>
           <path d="M -9 15 q 9 -8 18 0" class="f"/>`,
  '지침': `<path d="M -17 -9 l 12 4" class="f"/><path d="M 17 -9 l -12 4" class="f"/>
           <ellipse cx="0" cy="13" rx="6" ry="7" class="d"/>
           <path d="M 20 -17 q 7 10 0 14 q -7 -4 0 -14" fill="#CFE8FF"/>`,
  '그저 그런 날': `<circle cx="-10" cy="-6" r="4" class="d"/><circle cx="10" cy="-6" r="4" class="d"/>
           <path d="M -8 11 l 16 0" class="f"/>`,
};
// 이목구비 색: 배경색의 어두운 버전 (사랑은 흰색이라 예외)
const DARK = {
  '기쁨': '#5C4A00', '사랑': '#FFFFFF', '설렘': '#7A2E55', '평온': '#0B4D1C', '슬픔': '#06335C',
  '불안': '#2E1A66', '화남': '#4A1A00', '지침': '#2E1F1A', '그저 그런 날': '#3A4046',
};

// ===== 둥근 스티커 얼굴 SVG (지도 마커, 범례, 뱃지용) =====
// size: 픽셀 크기 / badge: 일기 개수 뱃지(2개 이상일 때만 표시)
function faceSVG(emotion, size, badge) {
  const c = emotionColor(emotion);
  const dk = DARK[emotion] || '#3A4046';
  const badgeSvg = badge > 1
    ? `<circle cx="26" cy="-26" r="13" fill="#FFFDF6" stroke="${dk}" stroke-width="2"/>
       <text x="26" y="-21" text-anchor="middle" font-size="15" font-weight="bold" fill="${dk}" font-family="Gaegu">${badge}</text>`
    : '';
  return `<svg width="${size}" height="${size}" viewBox="-44 -44 88 88" xmlns="http://www.w3.org/2000/svg" style="display:block">
    <style>.f{stroke:${dk};stroke-width:3.5;fill:none;stroke-linecap:round}.d{fill:${dk}}</style>
    <circle r="34" fill="${c}" stroke="#FFFDF6" stroke-width="5"/>
    <g>${FACES[emotion] || FACES['그저 그런 날']}</g>
    ${badgeSvg}
  </svg>`;
}

// ===== 윤곽 없는 이목구비만 (캘린더의 네모 얼굴용) =====
function featuresSVG(emotion, size) {
  const dk = DARK[emotion] || '#3A4046';
  return `<svg width="${size}" height="${size}" viewBox="-44 -44 88 88" xmlns="http://www.w3.org/2000/svg" style="display:block">
    <style>.f{stroke:${dk};stroke-width:4;fill:none;stroke-linecap:round}.d{fill:${dk}}</style>
    <g>${FACES[emotion] || FACES['그저 그런 날']}</g>
  </svg>`;
}

// 목록에서 대표 감정 = 빈도가 가장 높은 감정 (동률이면 먼저 나온 것)
function dominantEmotion(list) {
  const count = {};
  for (const d of list) count[d.emotion] = (count[d.emotion] || 0) + 1;
  return Object.keys(count).sort((a, b) => count[b] - count[a])[0];
}

// ================= API 래퍼 =================
// fetch를 감싸서 JSON 처리 + 에러를 한 곳에서 처리
async function api(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // 로그인이 풀렸으면 로그인 페이지로 보냄
    if (res.status === 401 && !location.pathname.includes('login')) {
      location.href = '/login.html';
      return;
    }
    throw new Error(data.error || '요청에 실패했습니다.');
  }
  return data;
}

// ================= 기간 필터 =================
// 지도와 캘린더에 함께 적용. 페이지를 옮겨도 유지되도록 localStorage에 저장.
function getFilter() {
  try {
    return JSON.parse(localStorage.getItem('emotionFilter')) || { mode: 'all', from: null, to: null };
  } catch (e) {
    return { mode: 'all', from: null, to: null };
  }
}
function saveFilter(f) {
  localStorage.setItem('emotionFilter', JSON.stringify(f));
}
// 현재 필터의 [시작일, 끝일]을 돌려줌 (없는 쪽은 null)
function filterRange() {
  const f = getFilter();
  if (f.mode === 'all') return [null, null];
  if (f.mode === 'custom') return [f.from || null, f.to || null];
  const months = { '1m': 1, '3m': 3, '6m': 6 }[f.mode];
  const d = new Date();
  d.setMonth(d.getMonth() - months); // 오늘에서 N개월 전
  return [d.toISOString().slice(0, 10), null];
}
// 일기 배열에서 현재 필터에 맞는 것만 돌려줌 (지도/캘린더가 모두 이 함수를 거침)
function filterDiaries(list) {
  const [from, to] = filterRange();
  return list.filter((d) => (!from || d.diary_date >= from) && (!to || d.diary_date <= to));
}

// ================= 상단 내비게이션 =================
// 각 페이지에서 호출. 필터가 바뀌면 페이지가 정의한 window.applyFilter()를 불러 화면을 다시 그림.
async function renderNav(active) {
  let me = null;
  try { me = await api('/api/auth/me'); } catch (e) { return; } // 미로그인 시 api()가 리다이렉트

  const nav = document.createElement('nav');
  nav.className = 'nav';
  nav.innerHTML = `
    <a class="logo" href="/index.html">감정 기록</a>
    <a href="/index.html" class="${active === 'map' ? 'on' : ''}">지도</a>
    <a href="/calendar.html" class="${active === 'cal' ? 'on' : ''}">날짜별</a>
    <a href="/write.html" class="${active === 'write' ? 'on' : ''}">기록하기</a>
    <span class="spacer"></span>
    <span class="seg" id="segBox">
      <button data-mode="all">전체</button>
      <button data-mode="1m">1개월</button>
      <button data-mode="3m">3개월</button>
      <button data-mode="6m">6개월</button>
      <button data-mode="custom">기간설정</button>
    </span>
    <span class="user">${me.username} 님</span>
    <button id="logoutBtn" class="logout">로그아웃</button>
  `;

  // 기간 직접 설정 줄 (기간설정을 눌렀을 때만 보임)
  const rangeRow = document.createElement('div');
  rangeRow.className = 'range-row';
  rangeRow.id = 'rangeRow';
  rangeRow.innerHTML = `
    <input type="date" id="rangeFrom"> <span>~</span>
    <input type="date" id="rangeTo">
    <button class="btn" id="rangeApply">적용</button>
    <span class="hint" id="rangeMsg"></span>
  `;

  document.body.prepend(rangeRow);
  document.body.prepend(nav);

  // ----- 필터 버튼 동작 -----
  const f = getFilter();
  const buttons = nav.querySelectorAll('#segBox button');

  function highlight(mode) {
    buttons.forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
    rangeRow.style.display = mode === 'custom' ? 'flex' : 'none';
  }
  highlight(f.mode); // 저장된 필터 상태 복원
  if (f.mode === 'custom') {
    document.getElementById('rangeFrom').value = f.from || '';
    document.getElementById('rangeTo').value = f.to || '';
  }

  buttons.forEach((b) => {
    b.onclick = () => {
      const mode = b.dataset.mode;
      const cur = getFilter();
      saveFilter({ ...cur, mode });
      highlight(mode);
      // custom은 "적용"을 눌러야 반영, 나머지는 즉시 반영
      if (mode !== 'custom' && typeof window.applyFilter === 'function') window.applyFilter();
    };
  });

  document.getElementById('rangeApply').onclick = () => {
    const from = document.getElementById('rangeFrom').value;
    const to = document.getElementById('rangeTo').value;
    const msg = document.getElementById('rangeMsg');
    if (!from || !to) { msg.textContent = '시작일과 끝일을 모두 골라 주세요.'; return; }
    if (from > to) { msg.textContent = '시작일이 끝일보다 늦어요.'; return; }
    msg.textContent = '';
    saveFilter({ mode: 'custom', from, to });
    if (typeof window.applyFilter === 'function') window.applyFilter();
  };

  // ----- 로그아웃 -----
  document.getElementById('logoutBtn').onclick = async () => {
    await api('/api/auth/logout', { method: 'POST' });
    location.href = '/login.html';
  };
}

// ================= 카카오맵 SDK 로더 =================
// (키를 서버 /api/config 에서 받아와 script 태그를 만들어 줌)
function loadKakao() {
  return new Promise(async (resolve, reject) => {
    const { kakaoJsKey } = await api('/api/config');
    if (!kakaoJsKey) return reject(new Error('카카오 키가 설정되지 않았습니다. .env 파일을 확인하세요.'));

    const script = document.createElement('script');
    // services: 장소 검색 / clusterer: 마커 합치기 라이브러리
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${kakaoJsKey}&autoload=false&libraries=services,clusterer`;
    script.onload = () => kakao.maps.load(resolve); // SDK 내부 로딩까지 기다림
    script.onerror = () => reject(new Error('카카오맵을 불러오지 못했습니다. 키와 도메인 등록을 확인하세요.'));
    document.head.appendChild(script);
  });
}

// 날짜를 "2026년 5월 2일" 형태로 바꿔 줌 (모든 페이지 공용)
function prettyDate(ymd) {
  const [y, m, d] = ymd.split('-');
  return `${y}년 ${Number(m)}월 ${Number(d)}일`;
}
