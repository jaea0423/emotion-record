// routes/diaries.js - 일기 CRUD + AI 분석 + 음악 oEmbed
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { analyzeDiary, EMOTIONS } = require('../ai');

const router = express.Router();

// ---------- 사진 업로드 설정 (multer) ----------
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir); // 폴더 없으면 생성

const storage = multer.diskStorage({
  destination: uploadDir,
  // 파일명 충돌 방지: 시간 + 랜덤 숫자 + 원래 확장자
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1e6) + ext);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB 제한
  fileFilter: (req, file, cb) => {
    // 이미지 파일만 허용
    cb(null, file.mimetype.startsWith('image/'));
  },
});

// ---------- 로그인 확인 미들웨어 ----------
// 아래 모든 라우트는 로그인해야만 사용 가능
function requireLogin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
  next();
}
router.use(requireLogin);

// ---------- 음악 링크 미리보기 (oEmbed 프록시) ----------
// 브라우저에서 직접 호출하면 CORS에 막히므로 서버가 대신 호출해 줌
// [GET] /api/diaries/oembed?url=음악링크
router.get('/oembed', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url이 필요합니다.' });

  let endpoint = null;
  if (/youtube\.com|youtu\.be/.test(url)) {
    endpoint = 'https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(url);
  } else if (/open\.spotify\.com|spotify\.link/.test(url)) {
    endpoint = 'https://open.spotify.com/oembed?url=' + encodeURIComponent(url);
  } else {
    return res.status(400).json({ error: '유튜브 또는 스포티파이 링크만 지원합니다.' });
  }

  try {
    const r = await fetch(endpoint);
    if (!r.ok) return res.status(404).json({ error: '곡 정보를 찾을 수 없습니다. 링크를 확인하세요.' });
    const data = await r.json();
    // 필요한 정보만 추려서 응답
    res.json({ title: data.title, thumbnail: data.thumbnail_url || null });
  } catch (e) {
    res.status(500).json({ error: '곡 정보를 가져오지 못했습니다.' });
  }
});

// ---------- 일기 목록 ----------
// [GET] /api/diaries - 내 일기 전부 (지도/캘린더에서 사용)
router.get('/', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM diaries WHERE user_id = ? ORDER BY diary_date DESC, id DESC')
    .all(req.session.userId);
  res.json(rows);
});

// ---------- 일기 작성 ----------
// [POST] /api/diaries  (사진이 있을 수 있어서 multipart/form-data 로 받음)
router.post('/', upload.single('photo'), async (req, res) => {
  const { place_name, address, lat, lng, content, music_url, music_title, music_thumbnail, diary_date } = req.body;

  // 필수 값 검증
  if (!place_name || !lat || !lng) return res.status(400).json({ error: '장소를 선택해 주세요.' });
  if (!content || content.trim().length < 5) return res.status(400).json({ error: '일기를 5자 이상 적어 주세요.' });
  if (!diary_date) return res.status(400).json({ error: '날짜를 선택해 주세요.' });

  // AI에게 제목 + 감정 분석 요청 (실패하면 fallback이 자동 적용됨)
  const ai = await analyzeDiary(content);

  const result = db
    .prepare(`INSERT INTO diaries
      (user_id, place_name, address, lat, lng, content, ai_title, emotion,
       photo_path, music_url, music_title, music_thumbnail, diary_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      req.session.userId, place_name, address || '', Number(lat), Number(lng),
      content, ai.title, ai.emotion,
      req.file ? '/uploads/' + req.file.filename : null,
      music_url || null, music_title || null, music_thumbnail || null,
      diary_date
    );

  const saved = db.prepare('SELECT * FROM diaries WHERE id = ?').get(result.lastInsertRowid);
  // fromAI가 false면 프론트에서 "AI 분석에 실패해 기본값으로 저장됨"을 안내
  res.json({ ...saved, fromAI: ai.fromAI });
});

// ---------- 일기 하나 조회 ----------
router.get('/:id', (req, res) => {
  const row = db
    .prepare('SELECT * FROM diaries WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.session.userId);
  if (!row) return res.status(404).json({ error: '일기를 찾을 수 없습니다.' });
  res.json(row);
});

// ---------- 일기 수정 (제목 + 감정) ----------
// AI의 판단은 참고일 뿐 -- 사용자가 제목(요약)과 감정을 직접 고칠 수 있음
// [PUT] /api/diaries/:id   body: { ai_title?, emotion? } (둘 중 하나만 보내도 됨)
router.put('/:id', (req, res) => {
  const { ai_title, emotion } = req.body;

  // 감정이 왔다면 9가지 목록 안에 있는지 검증 (예외 감정 차단)
  if (emotion !== undefined && !EMOTIONS.includes(emotion)) {
    return res.status(400).json({ error: '잘못된 감정 값입니다.' });
  }

  // 보낸 값만 골라서 UPDATE 문을 동적으로 조립
  const sets = [];   // SQL의 "컬럼 = ?" 조각들
  const values = []; // ? 자리에 들어갈 값들
  if (typeof ai_title === 'string' && ai_title.trim()) {
    sets.push('ai_title = ?');
    values.push(ai_title.trim().slice(0, 30)); // 제목은 30자 제한
  }
  if (emotion) {
    sets.push('emotion = ?');
    values.push(emotion);
  }
  if (sets.length === 0) return res.status(400).json({ error: '수정할 내용이 없습니다.' });

  const result = db
    .prepare(`UPDATE diaries SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`)
    .run(...values, req.params.id, req.session.userId);
  if (result.changes === 0) return res.status(404).json({ error: '일기를 찾을 수 없습니다.' });

  // 수정된 최신 일기를 그대로 돌려줌 (프론트가 화면 갱신에 사용)
  res.json(db.prepare('SELECT * FROM diaries WHERE id = ?').get(req.params.id));
});

// ---------- 일기 삭제 ----------
router.delete('/:id', (req, res) => {
  // 사진 파일도 같이 지우기 위해 먼저 조회
  const row = db.prepare('SELECT photo_path FROM diaries WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.session.userId);
  if (!row) return res.status(404).json({ error: '일기를 찾을 수 없습니다.' });

  db.prepare('DELETE FROM diaries WHERE id = ? AND user_id = ?').run(req.params.id, req.session.userId);

  // 업로드된 사진이 있으면 파일도 삭제 (없어도 에러 안 나게 try)
  if (row.photo_path) {
    try { fs.unlinkSync(path.join(__dirname, '..', row.photo_path)); } catch (e) {}
  }
  res.json({ ok: true });
});

module.exports = router;
