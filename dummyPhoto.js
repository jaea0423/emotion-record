// dummyPhoto.js - 시연용 "더미 사진" 생성기
// 진짜 사진 파일을 올리는 대신, SVG를 data URI(데이터 URI)로 만들어
// diaries.photo_path 에 그대로 넣는다. (외부 호스팅/Cloudinary 불필요, 온라인에서도 바로 보임)
//
// - 배경: 단색 (색마다 다름)
// - 글자: 중앙에 작게 "test image"
// - 규격(가로*세로): 사진마다 다르게 -> 앨범의 벽돌(masonry) 격자가 예쁘게 깔림

// 차분한 톤의 단색 팔레트 (18색, 네이비/뮤트 계열로 통일감)
const COLORS = [
  '#5B7DB1', '#C16E70', '#6FA98E', '#D7A45B', '#8E7BB5', '#5FA8A3',
  '#C77FA6', '#7E9B5A', '#B5654A', '#4F7CAC', '#A38FB8', '#669C7A',
  '#CC8B5C', '#9C5B6B', '#5C8DAE', '#B08968', '#7A8CA3', '#A86D8C',
];

// 가로*세로 규격 12종 (세로형 / 가로형 / 정사각 섞음) -> 격자 높이가 제각각이 됨
const SIZES = [
  [480, 640], [640, 480], [500, 500], [420, 620], [680, 440], [560, 560],
  [400, 600], [620, 420], [540, 720], [720, 500], [460, 560], [600, 380],
];

// 배경색이 밝으면 글자를 어둡게, 어두우면 글자를 흰색으로 (가독성)
function luminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255; // 0(어두움)~1(밝음)
}

// 인덱스 i 를 받아 그때그때 다른 더미 사진(데이터 URI 문자열)을 돌려준다.
// 색은 stride 7, 규격은 stride 1 로 돌려서 색*규격 조합이 골고루 섞이게 함.
function dummyPhoto(i) {
  const [w, h] = SIZES[i % SIZES.length];
  const bg = COLORS[(i * 7) % COLORS.length];
  const fg = luminance(bg) > 0.62 ? '#33373D' : '#FFFFFF'; // 밝은 배경엔 진한 글자

  // viewBox 없이 width/height 만 줘도 <img> 가 이 비율을 그대로 따라감
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>`
    + `<rect width='${w}' height='${h}' fill='${bg}'/>`
    + `<text x='${w / 2}' y='${h / 2}' font-family='Arial, sans-serif' font-size='26'`
    + ` fill='${fg}' text-anchor='middle' dominant-baseline='central'>test image</text>`
    + `</svg>`;

  // encodeURIComponent 로 '#' 등 특수문자까지 인코딩 -> src 에 바로 넣어도 안전
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

module.exports = { dummyPhoto };
