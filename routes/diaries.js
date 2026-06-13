// routes/diaries.js - 일기 CRUD + AI 분석 + 음악 oEmbed
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('node:crypto');
const cloudinary = require('cloudinary').v2;
const { q } = require('../db');
const { analyzeDiary, writeStory, EMOTIONS, getLastStoryError } = require('../ai');

const router = express.Router();

// ---------- 사진 저장 설정 ----------
// CLOUDINARY_URL 환경변수가 있으면 Cloudinary(외부 이미지 저장소)에 올려 영구 보관하고,
// 없으면 로컬 uploads 폴더에 저장(개발용 폴백). https URL을 그대로 photo_path에 넣어 둠.
cloudinary.config({ secure: true }); // CLOUDINARY_URL을 자동으로 읽음
const CLOUD_ON = !!process.env.CLOUDINARY_URL;

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir); // 로컬 폴백용 폴더

// 메모리에 담아 두고(파일을 바로 디스크에 쓰지 않음) Cloudinary든 로컬이든 골라서 처리
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB 제한
  fileFilter: (req, file, cb) => {
    cb(null, file.mimetype.startsWith('image/')); // 이미지 파일만 허용
  },
});

// 업로드된 사진(버퍼)을 저장하고, 화면에 쓸 경로(URL)를 돌려줌
async function savePhoto(file) {
  if (!file) return null;
  if (CLOUD_ON) {
    // Cloudinary로 업로드 -> 영구 https URL
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'memory-footprint', resource_type: 'image' },
        (err, res) => (err ? reject(err) : resolve(res))
      );
      stream.end(file.buffer);
    });
    return result.secure_url;
  }
  // 로컬 폴백: uploads 폴더에 직접 기록
  const fname = Date.now() + '-' + Math.round(Math.random() * 1e6) + path.extname(file.originalname);
  fs.writeFileSync(path.join(uploadDir, fname), file.buffer);
  return '/uploads/' + fname;
}

// Cloudinary URL에서 public_id 추출 (삭제용). 예: .../upload/v123/memory-footprint/abc.jpg -> memory-footprint/abc
function cloudinaryPublicId(url) {
  const m = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-zA-Z0-9]+$/);
  return m ? m[1] : null;
}

// 사진 파일 삭제 (Cloudinary면 destroy, 로컬이면 unlink). 실패해도 조용히 넘어감.
async function deletePhotoFile(photoPath) {
  if (!photoPath) return;
  if (/^https?:\/\//.test(photoPath)) {
    try { const pid = cloudinaryPublicId(photoPath); if (pid) await cloudinary.uploader.destroy(pid); } catch (e) {}
  } else {
    try { fs.unlinkSync(path.join(__dirname, '..', photoPath)); } catch (e) {}
  }
}

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

// ---------- AI 회고: 여러 기억을 한 편의 글로 ----------
// [POST] /api/diaries/story  body: { title: "묶음 이름", ids: [일기 id들] }
// 같은 묶음이면 캐시(stories 테이블)에서 바로 돌려줌
router.post('/story', async (req, res) => {
  const { title, ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: '일기 목록이 필요합니다.' });

  // 내 일기만 골라옴 (남의 일기 id를 보내도 무시됨)
  const placeholders = ids.map(() => '?').join(',');
  const rows = await q.all(
    `SELECT * FROM diaries WHERE id IN (${placeholders}) AND user_id = ? ORDER BY diary_date`,
    [...ids, req.session.userId]
  );
  if (rows.length === 0) return res.status(404).json({ error: '일기를 찾을 수 없습니다.' });

  // 너무 많으면 최신 30개만 사용 (프롬프트가 길어지는 것 방지)
  const used = rows.length > 30 ? rows.slice(-30) : rows;

  // 캐시 키: 제목 + 각 일기의 id/감정/제목 -> 일기가 추가/수정되면 키가 바뀌어 새로 생성됨
  const key = crypto.createHash('sha1')
    .update((title || '') + '|' + used.map((r) => `${r.id}:${r.emotion}:${r.ai_title}`).join('|'))
    .digest('hex');

  const hit = await q.get('SELECT story FROM stories WHERE user_id = ? AND cache_key = ?', [req.session.userId, key]);
  if (hit) return res.json({ story: hit.story, cached: true });

  // 일기당 앞 150자를 AI에게 전달 (너무 짧으면 맥락 누락, 너무 길면 프롬프트 낭비)
  const lines = used.map((r) => `- (${r.diary_date}, ${r.emotion}) ${r.ai_title || ''}: ${r.content.slice(0, 150)}`);
  const story = await writeStory(title || '이 곳', lines);
  if (!story) return res.status(503).json({ error: 'AI가 이야기를 만들지 못했어요. (사유: ' + (getLastStoryError() || '알 수 없음') + ')' });

  await q.run('INSERT INTO stories (user_id, cache_key, story) VALUES (?, ?, ?)', [req.session.userId, key, story]);
  res.json({ story, cached: false });
});

// ---------- 일기 목록 ----------
// [GET] /api/diaries - 내 일기 전부 (지도/캘린더에서 사용)
router.get('/', async (req, res) => {
  const rows = await q.all(
    'SELECT * FROM diaries WHERE user_id = ? ORDER BY diary_date DESC, id DESC',
    [req.session.userId]
  );
  res.json(rows);
});

// ---------- AI 미리 정리 (저장 전 제안) ----------
// [POST] /api/diaries/preview  body: { content }
// 저장하지 않고 AI의 제목/감정/키워드 제안만 돌려줌 -> 사용자가 확인/수정한 뒤 저장
router.post('/preview', async (req, res) => {
  const { content } = req.body;
  if (!content || content.trim().length < 5) return res.status(400).json({ error: '일기를 5자 이상 적어 주세요.' });
  const ai = await analyzeDiary(content);
  res.json(ai); // { title, emotion, keywords, fromAI }
});

// ---------- 일기 작성 ----------
// [POST] /api/diaries  (사진이 있을 수 있어서 multipart/form-data 로 받음)
// upload를 직접 감싸서, 용량 초과 등 업로드 에러를 "조용한 누락" 대신 명확한 에러로 돌려줌
router.post('/', (req, res, next) => {
  upload.single('photo')(req, res, (err) => {
    if (err) return res.status(400).json({ error: '사진 업로드에 실패했어요. 5MB 이하의 이미지만 올릴 수 있습니다.' });
    next();
  });
}, async (req, res) => {
  const { place_name, address, lat, lng, content, music_url, music_title, music_thumbnail, diary_date,
          ai_title, emotion: emotionGiven, keywords: keywordsGiven } = req.body;

  // 필수 값 검증
  if (!place_name || !lat || !lng) return res.status(400).json({ error: '장소를 선택해 주세요.' });
  if (!content || content.trim().length < 5) return res.status(400).json({ error: '일기를 5자 이상 적어 주세요.' });
  if (!diary_date) return res.status(400).json({ error: '날짜를 선택해 주세요.' });

  // 미리 정리(제안) 단계를 거쳐서 확정값이 왔으면 그대로 쓰고, 아니면 지금 AI 분석
  let ai;
  if (ai_title && emotionGiven && EMOTIONS.includes(emotionGiven)) {
    ai = {
      title: String(ai_title).trim().slice(0, 30),
      emotion: emotionGiven,
      keywords: String(keywordsGiven || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 5), // 직접 추가 포함 최대 5개
      fromAI: true,
    };
  } else {
    ai = await analyzeDiary(content); // (실패하면 fallback이 자동 적용됨)
  }

  // 사진이 있으면 저장(Cloudinary 또는 로컬)하고 그 경로를 받아 둠
  let photoPath = null;
  try {
    photoPath = await savePhoto(req.file);
  } catch (e) {
    return res.status(502).json({ error: '사진 저장에 실패했어요. 잠시 후 다시 시도해 주세요.' });
  }

  // INSERT 후 방금 저장된 행을 RETURNING *로 바로 돌려받음
  const saved = await q.get(`INSERT INTO diaries
      (user_id, place_name, address, lat, lng, content, ai_title, emotion,
       photo_path, music_url, music_title, music_thumbnail, keywords, diary_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    [
      req.session.userId, place_name, address || '', Number(lat), Number(lng),
      content, ai.title, ai.emotion,
      photoPath,
      music_url || null, music_title || null, music_thumbnail || null,
      ai.keywords && ai.keywords.length ? ai.keywords.join(',') : null, // 키워드 (쉼표 구분)
      diary_date,
    ]
  );

  // fromAI가 false면 프론트에서 "AI 분석에 실패해 기본값으로 저장됨"을 안내
  res.json({ ...saved, fromAI: ai.fromAI });
});

// ---------- 일기 하나 조회 ----------
router.get('/:id', async (req, res) => {
  const row = await q.get('SELECT * FROM diaries WHERE id = ? AND user_id = ?', [req.params.id, req.session.userId]);
  if (!row) return res.status(404).json({ error: '일기를 찾을 수 없습니다.' });
  res.json(row);
});

// ---------- 일기 수정 ----------
// AI의 판단은 참고일 뿐 -- 제목/감정/본문/키워드/장소/날짜/사진을 직접 고칠 수 있음
// [PUT] /api/diaries/:id   (사진 변경이 있을 수 있어 multipart/form-data 로 받음)
//   필드: ai_title?, emotion?, content?, keywords?, place_name?, diary_date?,
//         photo?(새 사진 파일), remove_photo?('1'이면 기존 사진 삭제)
router.put('/:id', (req, res, next) => {
  upload.single('photo')(req, res, (err) => {
    if (err) return res.status(400).json({ error: '사진 업로드에 실패했어요. 5MB 이하의 이미지만 올릴 수 있습니다.' });
    next();
  });
}, async (req, res) => {
  const { ai_title, emotion, content, keywords, place_name, diary_date } = req.body;

  // 감정이 왔다면 9가지 목록 안에 있는지 검증 (예외 감정 차단)
  if (emotion !== undefined && !EMOTIONS.includes(emotion)) {
    return res.status(400).json({ error: '잘못된 감정 값입니다.' });
  }
  // 본문이 왔다면 최소 길이 검증
  if (content !== undefined && content.trim().length < 5) {
    return res.status(400).json({ error: '일기를 5자 이상 적어 주세요.' });
  }
  // 날짜가 왔다면 형식(YYYY-MM-DD) 검증
  if (diary_date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(diary_date)) {
    return res.status(400).json({ error: '날짜 형식이 올바르지 않습니다.' });
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
  if (typeof content === 'string' && content.trim()) {
    sets.push('content = ?');
    values.push(content.trim());
  }
  if (keywords !== undefined) {
    // 키워드: 쉼표 구분, # 제거, 최대 5개. 비우면 키워드 없음(null)
    const list = String(keywords).split(',').map((k) => k.replace(/^#/, '').trim().slice(0, 12)).filter(Boolean).slice(0, 5);
    sets.push('keywords = ?');
    values.push(list.length ? list.join(',') : null);
  }
  if (typeof place_name === 'string' && place_name.trim()) {
    sets.push('place_name = ?');
    values.push(place_name.trim().slice(0, 60));
  }
  if (diary_date) {
    sets.push('diary_date = ?');
    values.push(diary_date);
  }

  // 사진 변경: 새 사진(req.file)이면 교체, remove_photo='1'이면 삭제. 기존 사진은 업데이트 후 정리.
  let oldPhotoToDelete = null;
  const existing = await q.get('SELECT photo_path FROM diaries WHERE id = ? AND user_id = ?', [req.params.id, req.session.userId]);
  if (!existing) return res.status(404).json({ error: '일기를 찾을 수 없습니다.' });
  if (req.file) {
    let newPath;
    try { newPath = await savePhoto(req.file); }
    catch (e) { return res.status(502).json({ error: '사진 저장에 실패했어요. 잠시 후 다시 시도해 주세요.' }); }
    sets.push('photo_path = ?'); values.push(newPath);
    oldPhotoToDelete = existing.photo_path; // 이전 사진은 교체 후 삭제
  } else if (req.body.remove_photo === '1') {
    sets.push('photo_path = ?'); values.push(null);
    oldPhotoToDelete = existing.photo_path;
  }

  if (sets.length === 0) return res.status(400).json({ error: '수정할 내용이 없습니다.' });

  const result = await q.run(
    `UPDATE diaries SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`,
    [...values, req.params.id, req.session.userId]
  );
  if (result.rowCount === 0) return res.status(404).json({ error: '일기를 찾을 수 없습니다.' });

  // 업데이트가 끝났으니 이전 사진 파일 정리 (실패해도 무시)
  if (oldPhotoToDelete) await deletePhotoFile(oldPhotoToDelete);

  // 수정된 최신 일기를 그대로 돌려줌 (프론트가 화면 갱신에 사용)
  res.json(await q.get('SELECT * FROM diaries WHERE id = ?', [req.params.id]));
});

// ---------- 일기 삭제 ----------
router.delete('/:id', async (req, res) => {
  // 사진 파일도 같이 지우기 위해 먼저 조회
  const row = await q.get('SELECT photo_path FROM diaries WHERE id = ? AND user_id = ?', [req.params.id, req.session.userId]);
  if (!row) return res.status(404).json({ error: '일기를 찾을 수 없습니다.' });

  await q.run('DELETE FROM diaries WHERE id = ? AND user_id = ?', [req.params.id, req.session.userId]);

  // 업로드된 사진도 같이 삭제 (실패해도 일기 삭제는 성공 처리)
  await deletePhotoFile(row.photo_path);
  res.json({ ok: true });
});

module.exports = router;
