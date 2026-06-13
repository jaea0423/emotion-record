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

// ===== 감정 선택기 (색 원 + 이름) =====
// 네이티브 <select>는 옵션마다 색 동그라미를 못 넣어서 커스텀 드롭다운으로 만듦
function emotionDot(e) { return `<span class="emo-cdot" style="background:${emotionColor(e)}"></span>`; }

// id를 가진 선택기 HTML을 돌려줌 (선택값은 box.dataset.val 에 보관)
function emotionPickerHTML(id, selected) {
  return `<div class="emo-pick" id="${id}" data-val="${selected}">
    <button type="button" class="emo-pick-btn">${emotionDot(selected)}<span class="epb-name">${selected}</span><span class="arr">▾</span></button>
    <div class="emo-pick-menu">
      ${EMOTION_LIST.map((e) => `<button type="button" data-emo="${e}" class="${e === selected ? 'on' : ''}">${emotionDot(e)}${e}</button>`).join('')}
    </div>
  </div>`;
}

// 선택기 동작 연결 (메뉴 열고 닫기, 선택 시 버튼 갱신)
function wireEmotionPicker(id, onChange) {
  const box = document.getElementById(id);
  if (!box) return;
  const btn = box.querySelector('.emo-pick-btn');
  const menu = box.querySelector('.emo-pick-menu');
  btn.onclick = (e) => { e.stopPropagation(); menu.classList.toggle('open'); };
  document.addEventListener('click', () => menu.classList.remove('open'));
  box.querySelectorAll('[data-emo]').forEach((b) => {
    b.onclick = () => {
      const e = b.dataset.emo;
      box.dataset.val = e;
      btn.innerHTML = `${emotionDot(e)}<span class="epb-name">${e}</span><span class="arr">▾</span>`;
      box.querySelectorAll('[data-emo]').forEach((x) => x.classList.toggle('on', x.dataset.emo === e));
      menu.classList.remove('open');
      if (onChange) onChange(e);
    };
  });
}
function getEmotionPick(id) { const b = document.getElementById(id); return b ? b.dataset.val : null; }

// ===== 감정별 이목구비 (viewBox -44~44 기준, 마커와 캘린더가 함께 사용) =====
const FACES = {
  '기쁨': `<path d="M -16 -6 q 6 -8 12 0" class="f"/><path d="M 4 -6 q 6 -8 12 0" class="f"/>
           <path d="M -12 8 q 12 14 24 0" class="f"/>`,
  '사랑': `<path d="M -10 -10 c -3 -6 -12 -3 -9 4 c 2 4 9 8 9 8 c 0 0 7 -4 9 -8 c 3 -7 -6 -10 -9 -4 Z" fill="#8B1020"/>
           <path d="M 10 -10 c -3 -6 -12 -3 -9 4 c 2 4 9 8 9 8 c 0 0 7 -4 9 -8 c 3 -7 -6 -10 -9 -4 Z" fill="#8B1020"/>
           <path d="M -8 12 q 8 8 16 0" stroke="#8B1020" stroke-width="3.5" fill="none" stroke-linecap="round"/>`,
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
  '기쁨': '#5C4A00', '사랑': '#8B1020', '설렘': '#7A2E55', '평온': '#0B4D1C', '슬픔': '#06335C',
  '불안': '#2E1A66', '화남': '#4A1A00', '지침': '#2E1F1A', '그저 그런 날': '#3A4046',
};
// 얼굴 눈코입(표정) 색 = DARK와 동일 (사랑도 이제 다른 감정처럼 진한 색)
const FEATURE = DARK;

// 뱃지(개수)용 색: 기본은 이목구비 색과 같지만,
// '사랑'은 이목구비가 흰색이라 흰 뱃지 위에서 안 보임 -> 진한 빨강으로 대체
const BADGE_DARK = { ...DARK, '사랑': '#C2243C' };
function badgeColor(emotion) { return BADGE_DARK[emotion] || '#3A4046'; }

// ===== 둥근 스티커 얼굴 SVG (지도 마커, 범례, 뱃지용) =====
// size: 픽셀 크기 / badge: 일기 개수 뱃지(2개 이상일 때만 표시)
function faceSVG(emotion, size, badge, borderColor) {
  const c = emotionColor(emotion);
  const dk = FEATURE[emotion] || '#FFFFFF'; // 눈코입 색 (사랑=검정, 나머지=흰색)
  const border = borderColor || '#FFFDF6';  // 마커 테두리 (선택된 마커는 검정으로)
  const bdk = badgeColor(emotion); // 뱃지는 항상 잘 보이는 진한 색으로
  // 뱃지: 자릿수에 따라 폭이 늘어나는 알약 모양 (3자리 숫자도 안 넘침)
  let badgeSvg = '';
  if (badge > 1) {
    const label = String(badge);
    const fs = label.length >= 3 ? 12.5 : 15;                 // 3자리부터 글자 축소
    const w = Math.max(26, 10 + label.length * 9.5);          // 자릿수만큼 폭 확장
    const cx = 44 - w / 2 - 2;                                // 그림 영역(viewBox) 밖으로 안 나가게 오른쪽 정렬
    badgeSvg = `<rect x="${cx - w / 2}" y="-39" width="${w}" height="26" rx="13" fill="#FFFDF6" stroke="${bdk}" stroke-width="2"/>
       <text x="${cx}" y="-20.5" text-anchor="middle" font-size="${fs}" font-weight="bold" fill="${bdk}" font-family="'Noto Sans KR', sans-serif">${label}</text>`;
  }
  return `<svg width="${size}" height="${size}" viewBox="-44 -44 88 88" xmlns="http://www.w3.org/2000/svg" style="display:block">
    <style>.f{stroke:${dk};stroke-width:3.5;fill:none;stroke-linecap:round}.d{fill:${dk}}</style>
    <circle r="34" fill="${c}" stroke="${border}" stroke-width="5"/>
    <g>${FACES[emotion] || FACES['그저 그런 날']}</g>
    ${badgeSvg}
  </svg>`;
}

// ===== 윤곽 없는 이목구비만 (캘린더의 네모 얼굴용) =====
function featuresSVG(emotion, size) {
  const dk = FEATURE[emotion] || '#FFFFFF'; // 눈코입 색 (사랑=검정, 나머지=흰색)
  return `<svg width="${size}" height="${size}" viewBox="-44 -44 88 88" xmlns="http://www.w3.org/2000/svg" style="display:block">
    <style>.f{stroke:${dk};stroke-width:4;fill:none;stroke-linecap:round}.d{fill:${dk}}</style>
    <g>${FACES[emotion] || FACES['그저 그런 날']}</g>
  </svg>`;
}

// 감정 우선순위: 빈도가 같을 때 어느 표정을 보여줄지 (긍정 먼저, 부정 나중)
const EMOTION_PRIORITY = ['기쁨', '사랑', '설렘', '평온', '그저 그런 날', '슬픔', '불안', '지침', '화남'];

// 목록에서 대표 감정 = 빈도가 가장 높은 감정 (동률이면 우선순위 높은 것)
function dominantEmotion(list) {
  const count = {};
  for (const d of list) count[d.emotion] = (count[d.emotion] || 0) + 1;
  return Object.keys(count).sort((a, b) =>
    (count[b] - count[a]) || (EMOTION_PRIORITY.indexOf(a) - EMOTION_PRIORITY.indexOf(b))
  )[0];
}

// ================= HTML 이스케이프 =================
// 사용자가 쓴 글(<, > 등)을 HTML에 끼워 넣을 때 태그로 해석되지 않게 바꿔 줌
// (안 하면 일기에 <b> 같은 걸 썼을 때 화면이 깨지고, 스크립트 공격(XSS)도 가능해짐)
function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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

// 아이콘 (선 아이콘 SVG, stroke가 currentColor라 글자색을 따라감)
const NAV_ICONS = {
  map: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-5.5-7-11a7 7 0 1 1 14 0c0 5.5-7 11-7 11Z"/><circle cx="12" cy="10" r="2.6"/></svg>',
  cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/></svg>',
  write: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1Z"/></svg>',
  album: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.7"/><path d="M5 17.5l4.5-4.5 3 3 3.5-3.5 3.5 4"/></svg>',
  music: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18.5V6l10-2v12.5"/><circle cx="6.5" cy="18.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/></svg>',
  tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 9h14M5 15h14M10.5 4l-3 16M16.5 4l-3 16"/></svg>',
};

// ================= 화면 공통 뼈대 =================
// 영역 이름: 좌측 패널(감정 목록) / 우측 패널(기억 목록) / 메인 패널(지도·내용)
//  - 중앙 상단: "감정 기록" 로고
//  - 메인 패널 좌측 상단: [기간] 버튼 (누르면 메뉴)
//  - 메인 패널 우측 상단: [사용자] 버튼 (누르면 로그아웃)
//  - 메인 패널 좌/우측 하단: [앨범] / [음악]
//  - 하단 중앙 독: [기억 남기기][지도][캘린더]
async function renderNav(active) {
  let me = null;
  try { me = await api('/api/auth/me'); } catch (e) { return; } // 미로그인 시 api()가 리다이렉트
  if (!me) return; // 세션이 풀려 로그인 페이지로 넘어가는 중이면 여기서 멈춤

  // 지도 페이지(좌/우 패널 있음)에서는 모서리 버튼들을 메인 패널 기준으로 배치
  const hasSidePanels = !!document.querySelector('.map-layout');
  document.body.classList.toggle('has-side-panels', hasSidePanels);

  // 페이지별 노출 규칙:
  //  지도 = 모든 컨트롤 / 캘린더·기록 = 로고+내정보+독 / 앨범·음악 = 로고+내정보만
  const FULL = active === 'map';
  const SHOW_DOCK = ['map', 'cal', 'write', 'kw'].includes(active);

  // ----- 중앙 상단 로고 -----
  const top = document.createElement('header');
  top.className = 'topbar';
  top.innerHTML = `<a class="logo" href="/index.html"><span class="logo-mark">👣</span> 기억의 발자국</a>`;
  document.body.prepend(top);

  // ----- 메인 패널 좌측 상단: 기간 버튼 -----
  const filterBox = document.createElement('div');
  filterBox.className = 'corner corner-tl fdrop';
  filterBox.style.display = FULL ? '' : 'none'; // 기간 필터는 지도에서만
  filterBox.innerHTML = `
    <button type="button" class="fdrop-btn" id="fdropBtn">기간 <span class="arr">▾</span></button>
    <div class="fdrop-menu" id="fdropMenu">
      <button data-mode="all">전체</button>
      <button data-mode="1m">최근 1개월</button>
      <button data-mode="3m">최근 3개월</button>
      <button data-mode="6m">최근 6개월</button>
      <button data-mode="custom">기간 직접 선택</button>
      <div class="fdrop-range" id="fdropRange">
        <input type="date" id="rangeFrom">
        <input type="date" id="rangeTo">
        <button type="button" class="btn" id="rangeApply">적용</button>
        <div class="hint" id="rangeMsg"></div>
      </div>
    </div>`;
  document.body.appendChild(filterBox);

  // 지도 외 화면: 기간 자리에 뒤로가기 버튼
  if (!FULL) {
    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'corner corner-tl back-btn';
    backBtn.title = '뒤로가기';
    backBtn.innerHTML = '←';
    backBtn.onclick = () => {
      if (history.length > 1) history.back();
      else location.href = '/index.html'; // 직접 들어온 경우엔 지도로
    };
    document.body.appendChild(backBtn);
  }

  // ----- 메인 패널 우측 상단: 사용자 -> 로그아웃 -----
  const userBox = document.createElement('div');
  userBox.className = 'corner corner-tr fdrop';
  userBox.innerHTML = `
    <button type="button" class="fdrop-btn" id="userBtn">${esc(me.username)} 님 <span class="arr">▾</span></button>
    <div class="fdrop-menu" id="userMenu">
      <button id="logoutBtn">로그아웃</button>
    </div>`;
  document.body.appendChild(userBox);

  // ----- 메인 패널 좌/우측 하단: 앨범 / 음악 -----
  const dockHTML = `
    <nav class="dock">
      <a href="/write.html" class="dock-write ${active === 'write' ? 'on' : ''}">${NAV_ICONS.write}<span class="dl">기억 남기기</span></a>
      <a href="/index.html" class="${active === 'map' ? 'on' : ''}">${NAV_ICONS.map}<span class="dl">지도</span></a>
      <a href="/calendar.html" class="${active === 'cal' ? 'on' : ''}">${NAV_ICONS.cal}<span class="dl">캘린더</span></a>
      <a href="/keywords.html" class="${active === 'kw' ? 'on' : ''}">${NAV_ICONS.tag}<span class="dl">키워드</span></a>
    </nav>`;

  if (FULL) {
    // 지도: 앨범/음악은 메인 패널 좌/우 하단 모서리에, 독은 하단 중앙에
    const albumBtn = document.createElement('a');
    albumBtn.className = 'corner corner-bl corner-pill';
    albumBtn.href = '/album.html';
    albumBtn.innerHTML = `${NAV_ICONS.album}<span class="dl">앨범</span>`;
    document.body.appendChild(albumBtn);

    const musicBtn = document.createElement('a');
    musicBtn.className = 'corner corner-br corner-pill';
    musicBtn.href = '/music.html';
    musicBtn.innerHTML = `${NAV_ICONS.music}<span class="dl">음악</span>`;
    document.body.appendChild(musicBtn);

    document.body.insertAdjacentHTML('beforeend', `<div class="dock-row">${dockHTML}</div>`);
  } else if (SHOW_DOCK) {
    // 다른 화면: 하단 중앙 기준으로 [앨범] 독 [음악] 나란히
    document.body.insertAdjacentHTML('beforeend', `
      <div class="dock-row">
        <a class="corner-pill" href="/album.html">${NAV_ICONS.album}<span class="dl">앨범</span></a>
        ${dockHTML}
        <a class="corner-pill" href="/music.html">${NAV_ICONS.music}<span class="dl">음악</span></a>
      </div>`);
  }

  // ----- 기간 필터 동작 -----
  const f = getFilter();
  const dropBtn = document.getElementById('fdropBtn');
  const menu = document.getElementById('fdropMenu');
  const rangeArea = document.getElementById('fdropRange');
  const items = menu.querySelectorAll('button[data-mode]');

  function syncFilterUI(mode) {
    // 전체가 아닌 필터가 걸려 있으면 버튼을 노랗게 표시
    dropBtn.classList.toggle('active', mode !== 'all');
    items.forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
    rangeArea.classList.toggle('open', mode === 'custom');
  }
  syncFilterUI(f.mode); // 저장된 필터 상태 복원
  if (f.mode === 'custom') {
    document.getElementById('rangeFrom').value = f.from || '';
    document.getElementById('rangeTo').value = f.to || '';
  }

  const userMenu = document.getElementById('userMenu');
  dropBtn.onclick = (e) => { e.stopPropagation(); userMenu.classList.remove('open'); menu.classList.toggle('open'); };
  menu.onclick = (e) => e.stopPropagation(); // 메뉴 안쪽(날짜 입력 등) 클릭은 닫히지 않게
  document.addEventListener('click', () => { menu.classList.remove('open'); userMenu.classList.remove('open'); });

  items.forEach((b) => {
    b.onclick = () => {
      const mode = b.dataset.mode;
      saveFilter({ ...getFilter(), mode });
      syncFilterUI(mode);
      // custom은 날짜를 고르고 "적용"을 눌러야 반영, 나머지는 즉시 반영 + 닫기
      if (mode !== 'custom') {
        menu.classList.remove('open');
        if (typeof window.applyFilter === 'function') window.applyFilter();
      }
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
    menu.classList.remove('open');
    if (typeof window.applyFilter === 'function') window.applyFilter();
  };

  // ----- 사용자 버튼 -> 로그아웃 -----
  document.getElementById('userBtn').onclick = (e) => {
    e.stopPropagation();
    menu.classList.remove('open');
    userMenu.classList.toggle('open');
  };
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

// ================= AI 로딩 연출 (시리풍: 어두운 유리 위에 빛나는 물결) =================
// 채워진 물결 띠 여러 겹이 서로 다른 속도/방향으로 흐르고, 흰 물마루가 빛남
function aiLoaderHTML(text) {
  return `
  <div class="ai-loading">
    <svg viewBox="0 0 400 110" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="aib1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#5BE0FF" stop-opacity=".95"/><stop offset="1" stop-color="#1B5BFF" stop-opacity=".12"/>
        </linearGradient>
        <linearGradient id="aib2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#FF5BD0" stop-opacity=".8"/><stop offset="1" stop-color="#7A2BE2" stop-opacity=".1"/>
        </linearGradient>
        <linearGradient id="aib3" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#7CF7D4" stop-opacity=".8"/><stop offset="1" stop-color="#1B8BFF" stop-opacity=".08"/>
        </linearGradient>
      </defs>
      <g class="bw b2"><path fill="url(#aib2)" d="M0 70 C 70 42, 130 42, 200 70 C 270 98, 330 98, 400 70 C 470 42, 530 42, 600 70 C 670 98, 730 98, 800 70 L800 110 L0 110 Z"/></g>
      <g class="bw b3"><path fill="url(#aib3)" d="M0 64 C 60 90, 140 90, 200 64 C 260 38, 340 38, 400 64 C 460 90, 540 90, 600 64 C 660 38, 740 38, 800 64 L800 110 L0 110 Z"/></g>
      <g class="bw b1"><path fill="url(#aib1)" d="M0 60 C 60 28, 140 28, 200 60 C 260 92, 340 92, 400 60 C 460 28, 540 28, 600 60 C 660 92, 740 92, 800 60 L800 110 L0 110 Z"/></g>
      <g class="bw crest"><path fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" d="M0 60 C 60 28, 140 28, 200 60 C 260 92, 340 92, 400 60 C 460 28, 540 28, 600 60 C 660 92, 740 92, 800 60"/></g>
    </svg>
    <p class="ai-loading-text">${text}</p>
  </div>`;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ================= AI 회고 버튼 (지도/캘린더 공용) =================
// 버튼을 누르면 /api/diaries/story 를 불러 상자에 글을 보여 줌
// title: 묶음 이름 / ids: 일기 id 배열
// btnId/boxId: 한 페이지에 회고 버튼이 여러 개일 때(달 회고 + 날 회고) id 충돌을 피하기 위함
function wireStory(title, ids, btnId = 'storyBtn', boxId = 'storyBox') {
  const btn = document.getElementById(btnId);
  const box = document.getElementById(boxId);
  if (!btn || !box) return;
  const label = btn.textContent;

  btn.onclick = async () => {
    // 버튼을 숨기고 물결 연출 시작
    btn.style.display = 'none';
    box.style.display = 'block';
    box.classList.add('loading');
    box.classList.remove('reveal');
    box.innerHTML = aiLoaderHTML('AI가 기억을 읽고 있어요');

    // 진행 문구가 단계별로 바뀜 (AI가 일하고 있다는 느낌)
    const phases = ['감정의 흐름을 따라가는 중', '문장을 고르고 있어요', '거의 다 됐어요'];
    let pi = 0;
    const phaseTimer = setInterval(() => {
      const t = box.querySelector('.ai-loading-text');
      if (t && pi < phases.length) t.textContent = phases[pi++];
    }, 1600);

    try {
      // 응답이 빨라도(캐시) 최소 1.5초는 연출을 보여 줌
      const [r] = await Promise.all([
        api('/api/diaries/story', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, ids }),
        }),
        sleep(1500),
      ]);
      box.classList.remove('loading');
      box.classList.add('reveal'); // 글이 아래에서 떠오르는 효과
      box.textContent = r.story;
    } catch (e) {
      box.classList.remove('loading');
      box.textContent = e.message;
      btn.style.display = ''; // 실패하면 다시 시도할 수 있게 버튼 복구
      btn.disabled = false;
      btn.textContent = label;
    } finally {
      clearInterval(phaseTimer);
    }
  };
}

// 날짜를 "2026년 5월 2일" 형태로 바꿔 줌 (모든 페이지 공용)
function prettyDate(ymd) {
  const [y, m, d] = ymd.split('-');
  return `${y}년 ${Number(m)}월 ${Number(d)}일`;
}
