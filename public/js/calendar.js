// calendar.js - 기록이 있는 날은 칸 자체가 그 날의 얼굴이 되는 달력
let diaries = [];
let year, month; // 현재 보고 있는 년/월 (month는 0~11)

(async function init() {
  await renderNav('cal');
  diaries = await api('/api/diaries');

  const now = new Date();
  year = now.getFullYear();
  month = now.getMonth();

  document.getElementById('prevBtn').onclick = () => moveMonth(-1);
  document.getElementById('nextBtn').onclick = () => moveMonth(1);
  render();
})();

// 기간 필터가 바뀌면 common.js의 renderNav가 이 함수를 불러 줌
window.applyFilter = () => {
  render();
  document.getElementById('dayList').innerHTML = '';
};

function moveMonth(delta) {
  month += delta;
  // 12월에서 +1 하면 다음 해 1월로, 1월에서 -1 하면 작년 12월로
  if (month > 11) { month = 0; year++; }
  if (month < 0) { month = 11; year--; }
  render();
}

function render() {
  document.getElementById('calTitle').textContent = `${year}년 ${month + 1}월`;
  const grid = document.getElementById('calGrid');
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
        style="background:${emotionColor(emo)}; border-color:${dk}; color:${dk};">
        <span class="dnum">${date}</span>
        <div class="facesvg">${featuresSVG(emo, 52)}</div>
        ${dayDiaries.length > 1 ? `<span class="cnt">${dayDiaries.length}</span>` : ''}
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
}

function showDay(ymd) {
  const box = document.getElementById('dayList');
  const dayDiaries = filterDiaries(diaries).filter((d) => d.diary_date === ymd);

  // + 버튼: 이 날짜가 미리 입력된 채로 작성 페이지 열기 (기록 없는 날에도 가능)
  const addBtn = `<button class="btn main" style="width:100%; margin-top:14px;" id="writeOnBtn">＋ 이 날의 기억 남기기</button>`;

  if (dayDiaries.length === 0) {
    box.innerHTML = `<h2>이 날의 기억</h2>
      <p class="hint">${prettyDate(ymd)} — 아직 기록이 없어요.</p>${addBtn}`;
  } else {
    // 일기 카드 클릭 시 지도 페이지에서 해당 일기가 열리도록 ?diary=ID 로 이동
    box.innerHTML = `<h2>이 날의 기억</h2>
      <p class="hint" style="margin-bottom:10px;">${prettyDate(ymd)} · ${dayDiaries.length}개</p>` +
      dayDiaries.map((d) => `
        <div class="diary-item" onclick="location.href='/index.html?diary=${d.id}'">
          <div class="d-row">
            <div class="d-face">${faceSVG(d.emotion, 34, 0)}</div>
            <div>
              <span class="d-date">${d.place_name}</span>
              <p class="d-title">${d.ai_title || '(제목 없음)'}</p>
            </div>
          </div>
        </div>`).join('') + addBtn;
  }

  document.getElementById('writeOnBtn').onclick = () => {
    sessionStorage.setItem('prefillDate', ymd);
    location.href = '/write.html';
  };
}
