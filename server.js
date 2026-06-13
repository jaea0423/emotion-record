// server.js - "기억의 발자국" 메인 서버
require('dotenv').config(); // .env 파일의 환경 변수 불러오기
const express = require('express');
const session = require('express-session');
const path = require('path');
const { initDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- 공통 미들웨어 ----------
app.use(express.json());                          // JSON 요청 본문 해석
app.use(express.urlencoded({ extended: true })); // 폼 데이터 해석

// 세션: 로그인 상태를 서버 메모리에 저장 (프로젝트 규모에선 충분)
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 }, // 24시간 유지
}));

// 첫 화면: 로그인 안 했으면 로그인 페이지로, 했으면 지도로
// (express.static보다 먼저 둬야 index.html이 자동으로 나가는 걸 가로챌 수 있음)
app.get('/', (req, res) => {
  res.redirect(req.session.userId ? '/index.html' : '/login.html');
});

// 정적 파일 제공: public 폴더(html/css/js), uploads 폴더(사진)
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ---------- 프론트에 설정값 전달 ----------
// 카카오맵 JS 키는 도메인 제한이 걸려 있어 노출돼도 비교적 안전하지만,
// Gemini 키는 절대 프론트로 보내면 안 됨 (서버에서만 사용)
app.get('/api/config', (req, res) => {
  res.json({ kakaoJsKey: process.env.KAKAO_JS_KEY || '' });
});

// ---------- 라우터 연결 ----------
app.use('/api/auth', require('./routes/auth'));
app.use('/api/diaries', require('./routes/diaries'));

// ---------- 서버 시작 ----------
// DB(테이블)부터 준비한 뒤 서버를 연다. DB 연결 실패 시 원인을 출력하고 종료.
initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`"기억의 발자국" 서버 실행 중: http://localhost:${PORT}`);
      if (!process.env.DATABASE_URL) console.log('⚠ DATABASE_URL이 없습니다. PostgreSQL 연결 문자열을 .env(로컬)/Render 환경변수에 넣어 주세요.');
      if (!process.env.KAKAO_JS_KEY) console.log('⚠ KAKAO_JS_KEY가 없습니다. 지도가 표시되지 않습니다. (.env 확인)');
      if (!process.env.GEMINI_API_KEY) console.log('⚠ GEMINI_API_KEY가 없습니다. AI 분석 대신 기본값이 저장됩니다. (.env 확인)');
    });
  })
  .catch((err) => {
    console.error('❌ DB 초기화 실패. DATABASE_URL을 확인하세요:', err.message);
    process.exit(1);
  });
