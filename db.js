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
    diary_date      TEXT NOT NULL,             -- 일기 날짜 (YYYY-MM-DD)
    created_at      TEXT DEFAULT (datetime('now', 'localtime'))
  );
`);

// 감정 이름 마이그레이션: 예전 데이터의 '분노'를 '화남'으로 바꿔 줌 (없으면 아무 일도 안 함)
db.exec(`UPDATE diaries SET emotion = '화남' WHERE emotion = '분노'`);

module.exports = db;
