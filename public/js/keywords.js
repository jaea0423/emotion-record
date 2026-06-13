// keywords.js - 키워드 워드 클라우드: AI가 뽑은 키워드들이 허공에 둥둥 떠다님
// 많이 나온 키워드일수록 글자가 크고 중앙 가까이에 놓임 (나선형 배치)
let diaries = [];

(async function init() {
  await renderNav('kw');
  diaries = await api('/api/diaries');
  render();
})();

// 기간 필터가 바뀌면 다시 그림 (이 창엔 기간 버튼이 없지만 저장된 필터는 적용됨)
window.applyFilter = render;
// 창 크기가 바뀌면 다시 배치
let resizeTimer;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(render, 250); });

function render() {
  const box = document.getElementById('cloud');
  box.innerHTML = '';

  // 기간 필터 적용 후 키워드별 개수 집계
  const visible = filterDiaries(diaries);
  const counts = {};
  for (const d of visible) {
    for (const k of (d.keywords || '').split(',')) {
      if (k) counts[k] = (counts[k] || 0) + 1;
    }
  }
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 60); // 상위 60개

  if (!entries.length) {
    box.innerHTML = `<p class="hint" style="text-align:center; padding-top:42vh;">
      아직 키워드가 없어요. 일기를 쓰면 AI가 키워드를 뽑아 드려요.</p>`;
    return;
  }

  // 모바일은 좁아서 나선 배치로는 대부분 칸을 못 찾아 버려짐 -> 흐름(wrap) 배치로 "모두" 표시
  const isMobile = window.matchMedia('(max-width: 700px)').matches;
  const W = box.clientWidth, H = box.clientHeight;
  const cx = W / 2, cy = H / 2;
  const max = Math.sqrt(entries[0][1]);
  const min = Math.sqrt(entries[entries.length - 1][1]);
  const placed = []; // (데스크톱) 이미 자리 잡은 칩들의 사각형 (겹침 방지)

  entries.forEach(([k, c], i) => {
    // 개수 -> 글자 크기 (제곱근 비례). 모바일은 범위를 좁혀 태그 목록처럼 단정하게
    const t = max === min ? 1 : (Math.sqrt(c) - min) / (max - min);
    const fs = isMobile ? (15 + t * 20) : (18 + t * 56);

    const el = document.createElement('button');
    el.type = 'button';
    const isBig = t > 0.72;
    el.className = 'cloud-chip' + (isBig ? ' big' : '');
    el.style.fontSize = fs + 'px';
    // 빈도가 높을수록 색이 진한 네이비에 가깝게 (낮으면 차분한 블루그레이) — 네이비 테마 통일
    if (!isBig) el.style.color = mixColor('#9AA6BC', '#2B4570', t);
    el.innerHTML = `#${esc(k)} <span class="cc">${c}</span>`;
    // 클릭 -> 지도에서 이 키워드만 보기
    el.onclick = () => {
      sessionStorage.setItem('jumpKeyword', k);
      location.href = '/index.html';
    };

    // ----- 모바일: 흐름(wrap) 배치 + 칩마다 다른 흔들림으로 "자유분방하지만 정돈된" 느낌 -----
    if (isMobile) {
      // sin 기반 = 물결처럼 부드러운 흐름(균형), 모듈러 여백 = 들쭉날쭉함(불균형)
      const jy = (Math.sin(i * 1.7) * 11).toFixed(1);          // 세로 -11~11px
      const rot = (Math.sin(i * 2.3) * 3).toFixed(1);          // 회전 -3~3도
      const mTop = 4 + (i * 5) % 10;                           // 위아래 여백 4~13px
      const mSide = 3 + (i * 7) % 10;                          // 좌우 여백 3~12px
      el.style.transform = `translateY(${jy}px) rotate(${rot}deg)`;
      el.style.margin = `${mTop}px ${mSide}px`;
      box.appendChild(el);
      return;
    }

    // ----- 데스크톱: 중앙에서 나선을 그리며 빈자리를 찾는 워드클라우드 -----
    el.style.visibility = 'hidden';
    box.appendChild(el);
    const w = el.offsetWidth + 52, h = el.offsetHeight + 42; // 여백을 크게 -> 화면 전체로 퍼짐
    const grow = Math.max(3.4, W / 240); // 나선이 화면 크기에 비례해 자람
    const yRatio = Math.min(0.8, Math.max(0.45, (H / W) * 1.35)); // 화면 비율에 맞는 타원
    let a = (i % 7) * 0.9; // 시작 각도를 조금씩 다르게
    let ok = false, x = cx, y = cy;
    for (let step = 0; step < 2400; step++) {
      x = cx + (4 + grow * a) * Math.cos(a);
      y = cy + (4 + grow * a) * Math.sin(a) * yRatio;
      a += 0.1;
      const r = { l: x - w / 2, t: y - h / 2, r: x + w / 2, b: y + h / 2 };
      if (r.l < 6 || r.t < 6 || r.r > W - 6 || r.b > H - 6) continue; // 화면 밖
      if (!placed.some((p) => r.l < p.r && r.r > p.l && r.t < p.b && r.b > p.t)) {
        placed.push(r); ok = true; break;
      }
    }
    if (!ok) { el.remove(); return; } // 자리가 없으면 생략
    el.style.left = (x - (w - 16) / 2) + 'px';
    el.style.top = (y - (h - 12) / 2) + 'px';
    // 둥둥 떠다니기: 저마다 다른 주기/시작점
    el.style.animationDuration = (4.5 + (i * 0.7) % 3.5) + 's';
    el.style.animationDelay = -((i * 1.3) % 4) + 's';
    el.style.visibility = '';
  });
}

// 두 색(hex) 사이를 t(0~1)만큼 섞음 — 빈도에 따른 노랑 그라데이션용
function mixColor(c1, c2, t) {
  const p = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  const [r1, g1, b1] = p(c1), [r2, g2, b2] = p(c2);
  const m = (a, b) => Math.round(a + (b - a) * t);
  return `rgb(${m(r1, r2)}, ${m(g1, g2)}, ${m(b1, b2)})`;
}
