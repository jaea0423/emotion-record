// db.js - SQLite 데이터베이스 연결 및 테이블 생성
// Node.js 22 이상에 내장된 SQLite를 사용 (별도 설치 불필요)
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

// 프로젝트 폴더 안에 memory.db 파일로 저장됨
const db = new DatabaseSync(path.join(__dirname, 'memory.db'));

// 테이블이 없으면 생성 (서버 시작 시 1회 실행)
db.exec(`
  -- 사용자 테이블
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT UNIQUE NOT NULL,        -- 아이디 (중복 불가)
    password_hash TEXT NOT NULL,               -- bcrypt 해시된 비밀번호 (평문 저장 금지!)
    created_at    TEXT DEFAULT (datetime('now', 'localtime'))
  );

  -- 일기 테이블
  CREATE TABLE IF NOT EXISTS diaries (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id),
    place_name      TEXT NOT NULL,             -- 장소 이름 (예: 스타벅스 OO점)
    address         TEXT,                      -- 주소
    lat             REAL NOT NULL,             -- 위도
    lng             REAL NOT NULL,             -- 경도
    content         TEXT NOT NULL,             -- 일기 본문
    ai_title        TEXT,                      -- AI가 만든 한 줄 제목
    emotion         TEXT NOT NULL,             -- 9가지 감정 중 하나
    photo_path      TEXT,                      -- 업로드한 사진 경로 (선택)
    music_url       TEXT,                      -- 음악 링크 (선택)
    music_title     TEXT,                      -- oEmbed로 가져온 곡 제목
    music_thumbnail TEXT,                      -- oEmbed로 가져온 썸네일
    keywords        TEXT,                      -- AI가 뽑은 키워드 (쉼표로 구분, 예: "여행,바다")
    diary_date      TEXT NOT NULL,             -- 일기 날짜 (YYYY-MM-DD)
    created_at      TEXT DEFAULT (datetime('now', 'localtime'))
  );
`);

// keywords 컬럼이 없던 예전 DB를 위한 마이그레이션 (이미 있으면 에러가 나므로 무시)
try { db.exec(`ALTER TABLE diaries ADD COLUMN keywords TEXT`); } catch (e) { /* 이미 있음 */ }

// AI 회고 캐시: 같은 기억 묶음이면 다시 생성하지 않고 저장해 둔 글을 재사용
// (Gemini 호출을 아끼고, 같은 장소를 다시 눌렀을 때 바로 보여 주기 위함)
db.exec(`
  CREATE TABLE IF NOT EXISTS stories (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    cache_key  TEXT NOT NULL,             -- 묶음 내용으로 만든 해시 (내용이 바뀌면 키도 바뀜)
    story      TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_stories_key ON stories(user_id, cache_key);
`);

// 감정 이름 마이그레이션: 예전 데이터의 이름을 현재 이름으로 바꿔 줌 (없으면 아무 일도 안 함)
db.exec(`UPDATE diaries SET emotion = '화남' WHERE emotion = '분노'`);
db.exec(`UPDATE diaries SET emotion = '평범' WHERE emotion = '그저 그런 날'`);

module.exports = db;
