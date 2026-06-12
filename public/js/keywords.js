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

  const W = box.clientWidth, H = box.clientHeight;
  const cx = W / 2, cy = H / 2;
  const max = Math.sqrt(entries[0][1]);
  const min = Math.sqrt(entries[entries.length - 1][1]);
  const placed = []; // 이미 자리 잡은 칩들의 사각형 (겹침 방지)

  entries.forEach(([k, c], i) => {
    // 개수 -> 글자 크기 (제곱근 비례: 차이가 너무 극단적이지 않게)
    const t = max === min ? 1 : (Math.sqrt(c) - min) / (max - min);
    const fs = 18 + t * 56; // 18px ~ 74px (화면이 차 보이게 크게)

    const el = document.createElement('button');
    el.type = 'button';
    const isBig = t > 0.72;
    el.className = 'cloud-chip' + (isBig ? ' big' : '');
    el.style.fontSize = fs + 'px';
    // 빈도가 높을수록 색이 노랑(꿀색)에 가깝게 (낮으면 차분한 모래색)
    if (!isBig) el.style.color = mixColor('#A99D8A', '#E8A200', t);
    el.innerHTML = `#${esc(k)} <span class="cc">${c}</span>`;
    el.style.visibility = 'hidden';
    box.appendChild(el);

    // 실제 크기를 잰 뒤, 중앙에서부터 나선을 그리며 빈자리를 찾음
    // (큰 키워드부터 배치하므로 자연스럽게 큰 것이 중앙에 모임)
    const w = el.offsetWidth + 52, h = el.offsetHeight + 42; // 여백을 크게 -> 화면 전체로 퍼짐
    // 나선이 화면 크기에 비례해 자라서 큰 화면에선 넓게 차지함
    const grow = Math.max(3.4, W / 240);
    const yRatio = Math.min(0.8, Math.max(0.45, (H / W) * 1.35)); // 화면 비율에 맞는 타원
    let a = (i % 7) * 0.9; // 시작 각도를 조금씩 다르게 (한 방향으로 쏠리지 않게)
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

    // 클릭 -> 지도에서 이 키워드만 보기
    el.onclick = () => {
      sessionStorage.setItem('jumpKeyword', k);
      location.href = '/index.html';
    };
  });
}

// 두 색(hex) 사이를 t(0~1)만큼 섞음 — 빈도에 따른 노랑 그라데이션용
function mixColor(c1, c2, t) {
  const p = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  const [r1, g1, b1] = p(c1), [r2, g2, b2] = p(c2);
  const m = (a, b) => Math.round(a + (b - a) * t);
  return `rgb(${m(r1, r2)}, ${m(g1, g2)}, ${m(b1, b2)})`;
}
