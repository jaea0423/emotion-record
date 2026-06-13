// routes/auth.js - 회원가입 / 로그인 / 로그아웃 / 내 정보
const express = require('express');
const bcrypt = require('bcryptjs');
const { q } = require('../db');

const router = express.Router();

// [GET] /api/auth/check?username=xxx - 아이디 중복 확인
router.get('/check', async (req, res) => {
  const { username } = req.query;
  if (!username) return res.status(400).json({ error: '아이디를 입력하세요.' });
  const exists = await q.get('SELECT id FROM users WHERE username = ?', [username]);
  res.json({ available: !exists }); // available: true 면 사용 가능
});

// [POST] /api/auth/register - 회원가입
router.post('/register', async (req, res) => {
  const { username, password, passwordConfirm } = req.body;

  // 입력값 검증
  if (!username || !password) return res.status(400).json({ error: '아이디와 비밀번호를 입력하세요.' });
  if (username.length < 3) return res.status(400).json({ error: '아이디는 3자 이상이어야 합니다.' });
  if (password.length < 4) return res.status(400).json({ error: '비밀번호는 4자 이상이어야 합니다.' });
  if (password !== passwordConfirm) return res.status(400).json({ error: '비밀번호가 서로 다릅니다.' });

  const exists = await q.get('SELECT id FROM users WHERE username = ?', [username]);
  if (exists) return res.status(409).json({ error: '이미 사용 중인 아이디입니다.' });

  // 비밀번호는 절대 평문으로 저장하지 않고 bcrypt로 해시해서 저장
  const hash = bcrypt.hashSync(password, 10);
  // PostgreSQL은 방금 넣은 행의 id를 RETURNING으로 돌려줌
  const row = await q.get('INSERT INTO users (username, password_hash) VALUES (?, ?) RETURNING id', [username, hash]);

  // 가입하자마자 로그인 상태로 만들어 줌 (세션에 사용자 id 저장)
  req.session.userId = row.id;
  req.session.username = username;
  res.json({ ok: true, username });
});

// [POST] /api/auth/login - 로그인
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await q.get('SELECT * FROM users WHERE username = ?', [username]);

  // 아이디가 없거나 비밀번호가 틀린 경우 (보안상 어떤 쪽이 틀렸는지는 알려주지 않음)
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
  }

  req.session.userId = user.id;
  req.session.username = user.username;
  res.json({ ok: true, username: user.username });
});

// [POST] /api/auth/logout - 로그아웃 (세션 삭제)
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// [GET] /api/auth/me - 현재 로그인한 사용자 확인
router.get('/me', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
  res.json({ userId: req.session.userId, username: req.session.username });
});

module.exports = router;
