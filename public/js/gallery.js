// gallery.js - 앨범(/album.html)과 음악(/music.html) 두 창이 함께 쓰는 코드
// 어느 창인지는 주소(pathname)로 판단. 항목을 누르면 지도에서 그 기억의 상세가 열림.
const IS_MUSIC = location.pathname.includes('music');
let diaries = [];

(async function init() {
  await renderNav(IS_MUSIC ? 'music' : 'album'); // 이 창들에선 로고+내 정보만 보임
  diaries = await api('/api/diaries');
  render();
})();

// (이 창엔 기간 버튼이 없지만, 지도에서 정한 필터는 그대로 적용됨)
window.applyFilter = render;

function render() {
  const body = document.getElementById('galBody');
  const visible = filterDiaries(diaries); // 기간 필터 적용 (common.js)

  if (!IS_MUSIC) {
    // ----- 앨범: 사진 벽돌 격자 -----
    // (주의: columns 배치에선 lazy 로딩이 높이 0 때문에 영영 안 불려서 즉시 로딩 사용)
    const list = visible.filter((d) => d.photo_path)
      .sort((a, b) => b.diary_date.localeCompare(a.diary_date));

    if (!list.length) {
      body.innerHTML = `<p class="hint" style="margin-top:20px;">아직 사진이 담긴 기억이 없어요.
        일기를 쓸 때 사진을 함께 남겨 보세요.</p>`;
      return;
    }
    body.innerHTML = `<p class="hint" style="margin:14px 0;">사진이 담긴 기억 ${list.length}개</p>
      <div class="gal-grid">
        ${list.map((d) => `
          <a class="gal-item" href="/index.html?diary=${d.id}">
            <img src="${d.photo_path}" alt="${esc(d.ai_title)}" />
            <div class="gal-cap">
              <div class="gal-face">${faceSVG(d.emotion, 26, 0)}</div>
              <div>
                <div class="gal-title">${esc(d.ai_title) || '(제목 없음)'}</div>
                <div class="gal-sub">${prettyDate(d.diary_date)} · ${esc(d.place_name)}</div>
              </div>
            </div>
          </a>`).join('')}
      </div>`;
  } else {
    // ----- 음악: 앨범아트 목록 -----
    const list = visible.filter((d) => d.music_url)
      .sort((a, b) => b.diary_date.localeCompare(a.diary_date));

    if (!list.length) {
      body.innerHTML = `<p class="hint" style="margin-top:20px;">아직 노래가 담긴 기억이 없어요.
        일기를 쓸 때 그 순간의 노래를 함께 남겨 보세요.</p>`;
      return;
    }
    // 한 줄에 3개씩: 앨범아트 크게 -> 곡 제목 -> 어떤 기억인지
    // (같은 노래라도 기억이 다르면 각각 보여 줌)
    body.innerHTML = `<p class="hint" style="margin:14px 0;">노래가 담긴 기억 ${list.length}개</p>
      <div class="song-grid">
        ${list.map((d) => `
          <a class="song-card" href="/index.html?diary=${d.id}">
            <div class="song-art">${d.music_thumbnail ? `<img src="${d.music_thumbnail}" alt="" loading="lazy">` : '♪'}</div>
            <div class="song-name">${esc(d.music_title) || '제목 없는 곡'}</div>
            <div class="song-mem">${faceSVG(d.emotion, 18, 0)} ${esc(d.ai_title) || '(제목 없음)'}</div>
            <div class="song-sub2">${prettyDate(d.diary_date)} · ${esc(d.place_name)}</div>
          </a>`).join('')}
      </div>`;
  }
}
