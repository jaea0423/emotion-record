// calendar.js - 월/년 보기 달력 (기록이 있는 날/달은 칸 자체가 얼굴이 됨)
let diaries = [];
let year, month;        // 현재 보고 있는 연/월 (month는 0~11)
let viewMode = 'month'; // 'month' = 월 보기, 'year' = 연도 보기
let selectedYmd = null; // 마지막으로 클릭한 날짜 (칸 강조용)

(async function init() {
  await renderNav('cal');
  diaries = await api('/api/diaries');

  const now = new Date();
  year = now.getFullYear();
  month = now.getMonth();

  document.getElementById('prevBtn').onclick = () => move(-1);
  document.getElementById('nextBtn').onclick = () => move(1);
  document.getElementById('modeMonth').onclick = () => setMode('month');
  document.getElementById('modeYear').onclick = () => setMode('year');

  // ----- 오른쪽 패널: 기본은 꺼짐(접힘), 날짜를 누르면 펼쳐짐 -----
  document.getElementById('panelClose').onclick = closePanel;
  const t = document.getElementById('panelToggle');
  if (t) t.onclick = () => setPanelCollapsed(!document.body.classList.contains('panel-collapsed'));
  setPanelCollapsed(true); // 처음엔 패널 off
  showPlaceholder();       // 패널 안에는 안내 문구

  render();
})();

// 기간 필터가 바뀌면 common.js의 renderNav가 이 함수를 불러 줌
window.applyFilter = () => {
  render();
  closePanel();
};

// ----- 패널 접기/펼치기 (지도와 동일하게 --panel-gap이 0이 되어 정렬이 따라 움직임) -----
function setPanelCollapsed(collapsed) {
  document.body.classList.toggle('panel-collapsed', collapsed);
  const t = document.getElementById('panelToggle');
  if (t) t.textContent = collapsed ? '‹' : '›';
}
function closePanel() {
  selectedYmd = null;
  markSelected();
  document.querySelector('.map-layout')?.classList.remove('panel-open');
  setPanelCollapsed(true);
  showPlaceholder();
}
function showPlaceholder() {
  document.getElementById('panelBody').innerHTML = `
    <div class="panel-placeholder">
      <div class="pp-face">${faceSVG('기쁨', 64, 0)}</div>
      <p>날짜를 눌러 보세요</p>
      <span class="hint">그 날의 기억이 여기에 나타나요</span>
    </div>`;
}

// 월/년 보기 전환
function setMode(mode) {
  viewMode = mode;
  document.getElementById('modeMonth').classList.toggle('on', mode === 'month');
  document.getElementById('modeYear').classList.toggle('on', mode === 'year');
  closePanel();
  render();
}

// ◀ ▶ 이동: 월 보기면 한 달씩, 연도 보기면 일 년씩
function move(delta) {
  if (viewMode === 'year') {
    year += delta;
  } else {
    month += delta;
    // 12월에서 +1 하면 다음 해 1월로, 1월에서 -1 하면 작년 12월로
    if (month > 11) { month = 0; year++; }
    if (month < 0) { month = 11; year--; }
  }
  render();
}

function render() {
  if (viewMode === 'year') renderYear();
  else renderMonth();
}

// ================= 월 보기 =================
function renderMonth() {
  document.getElementById('calTitle').textContent = `${year}년 ${month + 1}월`;
  const grid = document.getElementById('calGrid');
  grid.classList.remove('year');
  const visible = filterDiaries(diaries); // 기간 필터 적용 (common.js)

  // 요일 머리글
  let html = ['일', '월', '화', '수', '목', '금', '토']
    .map((d) => `<div class="dow">${d}</div>`).join('');

  const firstDay = new Date(year, month, 1).getDay();     // 1일의 요일 (0=일)
  const lastDate = new Date(year, month + 1, 0).getDate(); // 이 달의 마지막 날짜

  // 1일 앞의 빈 칸
  for (let i = 0; i < firstDay; i++) html += '<div class="cal-cell empty"></div>';

  // 날짜 칸
  for (let date = 1; date <= lastDate; date++) {
    const ymd = `${year}-${String(month + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
    const dayDiaries = visible.filter((d) => d.diary_date === ymd);

    if (dayDiaries.length) {
      // 기록이 있는 날: 칸 자체가 얼굴이 됨 (배경 = 대표 감정 색, 그 위에 눈코입)
      const emo = dominantEmotion(dayDiaries);
      const dk = DARK[emo] || '#3A4046';
      html += `<div class="cal-cell face" data-ymd="${ymd}"
        style="background:${emotionColor(emo)}; color:${dk};">
        <span class="dnum">${date}</span>
        <div class="facesvg">${featuresSVG(emo, 64)}</div>
        ${dayDiaries.length > 1 ? `<span class="cnt" style="color:${badgeColor(emo)};">${dayDiaries.length}</span>` : ''}
      </div>`;
    } else {
      html += `<div class="cal-cell" data-ymd="${ymd}">${date}</div>`;
    }
  }
  grid.innerHTML = html;

  // 날짜 클릭 -> 아래에 그 날의 일기 목록 표시
  grid.querySelectorAll('.cal-cell:not(.empty)').forEach((el) => {
    el.onclick = () => showDay(el.dataset.ymd);
  });
  markSelected(); // 달을 오가도 선택 표시 유지
}

// 선택한 날짜 칸을 도드라지게 (커지고 테두리)
function markSelected() {
  document.querySelectorAll('.cal-cell.sel').forEach((el) => el.classList.remove('sel'));
  if (!selectedYmd) return;
  const el = document.querySelector(`.cal-cell[data-ymd="${selectedYmd}"]`);
  if (el) el.classList.add('sel');
}

// ================= 연도 보기 =================
// 12달이 한 화면에: 기록이 있는 달은 그 달의 대표 감정 얼굴 + 개수
function renderYear() {
  document.getElementById('calTitle').textContent = `${year}년`;
  const grid = document.getElementById('calGrid');
  grid.classList.add('year');
  const visible = filterDiaries(diaries);

  let html = '';
  for (let m = 0; m < 12; m++) {
    const prefix = `${year}-${String(m + 1).padStart(2, '0')}`; // "2026-06"
    const monthDiaries = visible.filter((d) => d.diary_date.startsWith(prefix));

    if (monthDiaries.length) {
      const emo = dominantEmotion(monthDiaries);
      const dk = DARK[emo] || '#3A4046';
      html += `<div class="cal-cell face" data-m="${m}"
        style="background:${emotionColor(emo)}; color:${dk};">
        <span class="dnum">${m + 1}월</span>
        <div class="facesvg">${featuresSVG(emo, 76)}</div>
        <span class="cnt" style="color:${badgeColor(emo)};">${monthDiaries.length}</span>
      </div>`;
    } else {
      html += `<div class="cal-cell" data-m="${m}">${m + 1}월</div>`;
    }
  }
  grid.innerHTML = html;

  // 달 클릭 -> 그 달의 월 보기로 들어감
  grid.querySelectorAll('.cal-cell').forEach((el) => {
    el.onclick = () => { month = Number(el.dataset.m); setMode('month'); };
  });
}

// ================= 이 날의 기억 (오른쪽 패널) =================
function showDay(ymd) {
  selectedYmd = ymd;
  markSelected(); // 누른 칸을 바로 강조
  setPanelCollapsed(false); // 패널 펼침
  document.querySelector('.map-layout')?.classList.add('panel-open'); // 좁은 화면: 슬라이드 인

  const box = document.getElementById('panelBody');
  const dayDiaries = filterDiaries(diaries).filter((d) => d.diary_date === ymd);

  // + 버튼: 이 날짜가 미리 입력된 채로 작성 페이지 열기 (기록 없는 날에도 가능)
  const addBtn = `<button class="btn main" style="width:100%; margin-top:14px;" id="writeOnBtn">＋ 이 날의 기억 남기기</button>`;

  if (dayDiaries.length === 0) {
    box.innerHTML = `<p class="addr">${prettyDate(ymd)} — 아직 기록이 없어요.</p>
      ${aiRangeHTML(ymd)}${addBtn}`;
  } else {
    // 일기 카드 클릭 시 지도 페이지에서 해당 일기가 열리도록 ?diary=ID 로 이동
    box.innerHTML = `<p class="addr">${prettyDate(ymd)} · 이 날의 기억 ${dayDiaries.length}개</p>
      ${aiRangeHTML(ymd)}` +
      dayDiaries.map((d) => `
        <div class="diary-item" onclick="location.href='/index.html?diary=${d.id}'">
          <div class="d-row">
            <div class="d-face">${faceSVG(d.emotion, 46, 0)}</div>
            <div>
              <span class="d-date">${esc(d.place_name)}</span>
              <p class="d-title">${esc(d.ai_title) || '(제목 없음)'}</p>
            </div>
          </div>
        </div>`).join('') + addBtn;
  }

  wireAiRange(ymd); // 통합 AI 버튼(해/달/일 선택) 연결

  document.getElementById('writeOnBtn').onclick = () => {
    sessionStorage.setItem('prefillDate', ymd);
    location.href = '/write.html';
  };
}

// ----- 통합 AI 버튼: 하나만 두고, 누르면 선택한 날짜 기준 해/달/일 범위를 고름 -----
function aiRangeHTML(ymd) {
  return `
    <button class="btn ai-btn" style="width:100%;" id="aiOpenBtn">✨ AI가 들려주는 이야기</button>
    <div class="ai-range" id="aiRange" style="display:none;">
      <span class="ai-range-label">어느 범위로 들려줄까요?</span>
      <div class="ai-range-opts">
        <button type="button" class="ai-range-opt" data-range="day">이 날</button>
        <button type="button" class="ai-range-opt" data-range="month">이 달</button>
        <button type="button" class="ai-range-opt" data-range="year">이 해</button>
      </div>
    </div>
    <button class="btn ai-btn" id="storyBtn" style="display:none; width:100%;"></button>
    <div class="ai-story" id="storyBox" style="display:none; margin-top:10px;"></div>`;
}

function wireAiRange(ymd) {
  const [y, m] = ymd.split('-');
  const openBtn = document.getElementById('aiOpenBtn');
  const rangeBox = document.getElementById('aiRange');
  if (!openBtn) return;

  // 버튼 누르면 범위 선택 노출 (버튼 숨김)
  openBtn.onclick = () => { openBtn.style.display = 'none'; rangeBox.style.display = 'block'; };

  rangeBox.querySelectorAll('.ai-range-opt').forEach((opt) => {
    opt.onclick = () => {
      const range = opt.dataset.range;
      const all = filterDiaries(diaries);
      let ids, title;
      if (range === 'day') {
        ids = all.filter((d) => d.diary_date === ymd).map((d) => d.id);
        title = prettyDate(ymd);
      } else if (range === 'month') {
        const prefix = `${y}-${m}`; // "2026-06"
        ids = all.filter((d) => d.diary_date.startsWith(prefix)).map((d) => d.id);
        title = `${y}년 ${Number(m)}월`;
      } else { // year
        ids = all.filter((d) => d.diary_date.startsWith(`${y}-`)).map((d) => d.id);
        title = `${y}년`;
      }

      rangeBox.style.display = 'none';
      const storyBtn = document.getElementById('storyBtn');
      if (ids.length === 0) {
        // 그 범위에 기록이 없으면 안내만
        const sb = document.getElementById('storyBox');
        sb.style.display = 'block';
        sb.textContent = `${title}에는 아직 기억이 없어요.`;
        return;
      }
      // wireStory는 버튼 글자를 라벨로 쓰므로, 보이지 않게 글자만 채우고 자동 클릭
      storyBtn.textContent = `✨ ${title}의 이야기`;
      storyBtn.style.display = 'block';
      wireStory(title, ids, 'storyBtn', 'storyBox');
      storyBtn.click(); // 바로 이야기 생성 시작
    };
  });
}
