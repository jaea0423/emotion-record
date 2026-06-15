// seed_photos.js - 이미 만들어진 test 계정 일기들에 "더미 사진"을 붙인다.
// (데이터를 지우지 않는 비파괴 스크립트 — 사진만 추가/갱신)
//
// 실행:  node seed_photos.js
//   * .env 의 DATABASE_URL(Neon 연결 문자열)이 채워져 있어야 함
//   * 약 75%의 일기에 사진이 붙고, 나머지 25%는 사진 없이 남음
//
// 더미 사진은 SVG 데이터 URI라 Cloudinary 없이도 온라인(Render)에서 바로 보인다.

require('dotenv').config();
const { pool } = require('./db');
const { dummyPhoto } = require('./dummyPhoto');

// 몇 개마다 사진을 "건너뛸지" — 4면 4개 중 1개를 건너뜀 = 75% 에 사진이 붙음
// (5로 바꾸면 80%, 3으로 바꾸면 약 67%)
const SKIP_EVERY = 4;

(async () => {
  // test 계정 찾기
  const user = (await pool.query("SELECT id FROM users WHERE username = 'test'")).rows[0];
  if (!user) {
    console.log('test 계정이 없습니다. 먼저 npm run seed 로 더미 데이터를 만들어 주세요.');
    await pool.end();
    return;
  }

  // test 의 일기를 id 순(= 처음 생성된 순서)으로 가져옴
  const rows = (await pool.query(
    'SELECT id FROM diaries WHERE user_id = $1 ORDER BY id', [user.id]
  )).rows;

  if (rows.length === 0) {
    console.log('test 계정에 일기가 없습니다.');
    await pool.end();
    return;
  }

  let withPhoto = 0;
  for (let i = 0; i < rows.length; i++) {
    // 4개 중 1개(인덱스가 4의 배수)는 건너뛰어 사진 없는 일기로 남김
    if (i % SKIP_EVERY === 0) continue;
    const photo = dummyPhoto(i); // 인덱스마다 색/규격이 다른 더미 사진
    await pool.query('UPDATE diaries SET photo_path = $1 WHERE id = $2', [photo, rows[i].id]);
    withPhoto++;
  }

  const pct = Math.round((withPhoto / rows.length) * 100);
  console.log(`완료! 일기 ${rows.length}개 중 ${withPhoto}개(${pct}%)에 더미 사진을 붙였습니다.`);
  console.log('앨범(/album.html) 에서 벽돌 격자로 확인해 보세요.');
  await pool.end();
})().catch((err) => {
  console.error('실패:', err.message);
  process.exit(1);
});
