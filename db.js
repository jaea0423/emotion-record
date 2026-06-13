// db.js - PostgreSQL 연결 (node-postgres "pg")
// 데이터를 외부 공용 DB(예: Neon)에 저장 -> 로컬·배포가 같은 데이터를 보고, 재시작해도 안 사라짐.
// 연결 정보는 환경변수 DATABASE_URL 에서 읽음 (.env / Render 환경변수)
require('dotenv').config();
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('⚠ DATABASE_URL 환경변수가 없습니다. .env(로컬) 또는 Render 환경변수에 PostgreSQL 연결 문자열을 넣어 주세요.');
}

// Neon 등 클라우드 DB는 SSL이 필요. 로컬 postgres(localhost)는 SSL 끄기.
const isLocal = !connectionString || /localhost|127\.0\.0\.1/.test(connectionString);
const pool = new Pool({
  connectionString,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

// 기존 SQLite 스타일 쿼리(물음표 자리표시자)를 그대로 쓰기 위해 ?, ? -> $1, $2 로 변환
function toPg(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => '$' + (++i));
}

// 라우트에서 쓰는 얇은 헬퍼 (get=한 행, all=여러 행, run=실행결과)
const q = {
  async get(sql, params = []) { const r = await pool.query(toPg(sql), params); return r.rows[0]; },
  async all(sql, params = []) { const r = await pool.query(toPg(sql), params); return r.rows; },
  async run(sql, params = []) { return pool.query(toPg(sql), params); }, // r.rowCount, r.rows 사용 가능
};

// 서버 시작 시 1회: 테이블이 없으면 생성 + 감정 이름 마이그레이션
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      username      TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS diaries (
      id              SERIAL PRIMARY KEY,
      user_id         INTEGER NOT NULL REFERENCES users(id),
      place_name      TEXT NOT NULL,
      address         TEXT,
      lat             DOUBLE PRECISION NOT NULL,
      lng             DOUBLE PRECISION NOT NULL,
      content         TEXT NOT NULL,
      ai_title        TEXT,
      emotion         TEXT NOT NULL,
      photo_path      TEXT,
      music_url       TEXT,
      music_title     TEXT,
      music_thumbnail TEXT,
      keywords        TEXT,
      diary_date      TEXT NOT NULL,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    )`);

  // 예전 DB 호환: keywords 컬럼이 없으면 추가 (PostgreSQL은 IF NOT EXISTS 지원)
  await pool.query(`ALTER TABLE diaries ADD COLUMN IF NOT EXISTS keywords TEXT`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS stories (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id),
      cache_key  TEXT NOT NULL,
      story      TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_stories_key ON stories(user_id, cache_key)`);

  // 감정 이름 마이그레이션: 예전 이름을 현재 이름으로 (없으면 아무 일도 안 함)
  await pool.query(`UPDATE diaries SET emotion = '화남' WHERE emotion = '분노'`);
  await pool.query(`UPDATE diaries SET emotion = '평범' WHERE emotion = '그저 그런 날'`);
}

module.exports = { pool, q, initDb };
