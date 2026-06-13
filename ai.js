// ai.js - Gemini API를 호출해서 일기를 요약(제목)하고 감정을 분류
require('dotenv').config();

// 우리 서비스의 9가지 감정 (이 목록 밖의 감정은 존재할 수 없음)
const EMOTIONS = ['기쁨', '사랑', '설렘', '평온', '슬픔', '불안', '화남', '지침', '평범'];

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Gemini 호출 + 일시 오류 자동 재시도.
// 503(혼잡)/429(요청 과다)/5xx(일시 서버오류)/타임아웃이면 잠깐 쉬었다 다시 시도한다.
// 반환: { ok:true, data } 또는 { ok:false, status, body }
async function geminiGenerate(body, timeoutMs, tries = 3) {
  const apiKey = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
  let last = { ok: false, status: 0, body: '' };
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return { ok: true, data: await res.json() };
      last = { ok: false, status: res.status, body: await res.text() };
      // 혼잡(429)·일시 서버오류(5xx, 503 포함)면 점점 길게 쉬었다 재시도
      if ((res.status === 429 || res.status >= 500) && i < tries - 1) {
        await sleep(1500 * (i + 1));
        continue;
      }
      return last; // 400 등은 재시도해도 소용없음
    } catch (err) {
      // 타임아웃/네트워크 오류도 재시도 대상
      last = { ok: false, status: 0, body: err.message };
      if (i < tries - 1) { await sleep(1500 * (i + 1)); continue; }
    }
  }
  return last;
}

// 실패를 사용자에게 보여 줄 친절한 한 줄로 (원시 오류는 서버 콘솔에만)
function friendlyAiError(status) {
  if (status === 429 || status === 503) return 'AI 서버가 잠시 혼잡해요. 잠시 후 다시 시도해 주세요.';
  if (status === 0) return '응답이 늦어 잠시 끊겼어요. 잠시 후 다시 시도해 주세요.';
  return 'AI 응답에 문제가 있었어요. 잠시 후 다시 시도해 주세요.';
}

/**
 * 일기 본문을 받아 { title, emotion } 을 돌려준다.
 * Gemini가 실패하면 fallback(기본값)으로 처리해서 서비스가 멈추지 않게 한다.
 */
// AI 호출이 실패했을 때 본문 단어로 감정을 대략 추정 (평범 남발 방지)
function guessEmotion(text) {
  const rules = [
    ['화남', /짜증|화가|화났|열받|빡|어이없|서운|삐쳤|안\s?줬|안줬|싸웠|따졌|짜증나|불공평|억울/],
    ['슬픔', /슬프|슬펐|울었|눈물|그리워|보고\s?싶|외로|쓸쓸|헤어|이별|허전|먹먹/],
    ['불안', /불안|걱정|초조|떨려|떨렸|긴장|두려|막막|조마조마/],
    ['지침', /피곤|지쳐|지쳤|힘들|졸려|졸렸|번아웃|녹초|무기력|버거/],
    ['설렘', /설레|설렜|두근|기대|떨리는\s?마음|기다려/],
    ['사랑', /사랑|좋아해|애틋|보고팠|고마운\s?사람/],
    ['기쁨', /행복|기뻤|신나|신났|최고|즐거|뿌듯|웃었|기분\s?좋|행운/],
    ['평온', /평온|편안|차분|여유|잔잔|고요|포근|힐링/],
  ];
  for (const [emo, re] of rules) if (re.test(text)) return emo;
  return '평범';
}

async function analyzeDiary(content) {
  // 실패했을 때 쓸 기본값: 첫 문장 일부를 제목으로, 감정은 단어로 추정, 키워드 없음
  const fallback = {
    title: content.trim().split('\n')[0].slice(0, 20),
    emotion: guessEmotion(content),
    keywords: [],
    fromAI: false, // AI 분석 실패 표시 (프론트에서 안내용)
  };

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fallback; // 키가 없으면 바로 기본값

  // Gemini에게 보낼 지시문(프롬프트)
  // 제목은 단순 요약이 아니라, 일기책의 소제목 같은 서정적인 한 줄이 되도록 규칙과 예시를 줌
  const prompt = `너는 일기에 제목을 붙여 주는 작가다. 아래 일기를 읽고 JSON으로만 답해라. 다른 말은 절대 하지 마라.
형식: {"title": "한 줄 제목", "emotion": "아래 9개 중 정확히 하나", "keywords": ["키워드", ...]}

[제목 규칙]
- 한국어 6~16자. 일기책의 소제목처럼 서정적이고 여운이 남게.
- 일기 속의 구체적인 장면이나 사물 하나를 빌려서 쓸 것.
- 좋은 예: "창밖만 보던 날", "바람이 내 편이던 날", "같은 야경, 빈 옆자리", "심장 소리만 기억나는 오후"
- 나쁜 예(피할 것): "과제를 끝낸 날"(단순 요약), "행복했던 하루"(뻔함), "운명 같은 영혼의 시간"(과장)

[감정 규칙]
- 감정 목록: ${EMOTIONS.join(', ')}
- 반드시 일기에 드러난 마음에 "가장 가까운" 감정 하나를 골라라. 감정이 약하거나 섞여 있어도 방향을 잡아라.
- "평범"은 정말로 아무 감정 동요가 없는 무던한 하루에만 써라. 조금이라도 서운/짜증/설렘/뿌듯함 등이 보이면 그 감정을 택해라.
- 미묘한 예시:
  · "친구가 학식 한 입도 안 줬다" -> 장난 같지만 서운함/짜증 -> "화남"
  · "별일 없었지만 그 애 생각이 났다" -> "설렘"
  · "할 건 했는데 마음이 붕 떴다" -> "불안"
  · "그냥 밥 먹고 수업 듣고 집에 왔다" -> 진짜 무던함 -> "평범"

[키워드 규칙]
- 일기의 핵심을 나타내는 명사 1~3개. (예: "여자친구", "여행", "시험", "카페", "쇼핑")
- 한 키워드는 1~2단어, "#" 없이. 일기에 없는 내용으로 만들지 말 것.
- 마땅한 키워드가 없으면 빈 배열 [].

일기:
${content}`;

  try {
    // JSON만 답하도록 강제. (thinking은 켜 둠 -> 미묘한 감정도 신중히 판단)
    const result = await geminiGenerate({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' },
    }, 20000); // 20초 타임아웃, 혼잡하면 자동 재시도

    if (!result.ok) {
      console.error('Gemini 분석 오류:', result.status, String(result.body).slice(0, 200));
      return fallback; // 실패해도 일기는 기본값으로 저장됨
    }

    const data = result.data;
    // Gemini 응답 구조에서 텍스트 꺼내기
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return fallback;

    const parsed = JSON.parse(text); // JSON 형식이 깨졌으면 catch로 떨어짐

    // AI가 목록에 없는 감정을 답하면 단어 추정으로 교정 (예외 감정 차단)
    const emotion = EMOTIONS.includes(parsed.emotion) ? parsed.emotion : guessEmotion(content);
    const title = (parsed.title || fallback.title).slice(0, 30);

    // 키워드 정리: 배열인지 확인, # 제거, 너무 긴 것 자르기, 최대 3개
    const keywords = Array.isArray(parsed.keywords)
      ? parsed.keywords.map((k) => String(k).replace(/^#/, '').trim().slice(0, 12)).filter(Boolean).slice(0, 3)
      : [];

    return { title, emotion, keywords, fromAI: true };
  } catch (err) {
    console.error('Gemini 분석 실패:', err.message);
    return fallback;
  }
}

/**
 * 여러 일기를 모아 한 편의 서정적인 회고를 써 준다.
 * title: "카페 어니언 성수" / "이 근처" / "2026년 6월" 같은 묶음 이름
 * diaryLines: "- (날짜, 감정) 제목: 본문 일부" 형태의 문자열 배열
 * 실패하면 null (호출한 쪽에서 안내 처리)
 */
async function writeStory(title, diaryLines) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const prompt = `너는 흩어진 일기들을 모아 한 편의 회고를 써 주는 작가다. 아래는 "${title}"에 대한 나의 일기들이다.
이 기억들을 읽고 1인칭("나")의 회고를 한국어 3~5문장으로 써라. JSON으로만 답해라.
형식: {"story": "회고 본문"}

[규칙]
- 가장 중요: 일기에 없는 사건·사람·장소·날씨·사물을 절대 지어내지 말 것. 아래 일기에 적힌 것만 재료로 쓸 것.
- 확실하지 않은 것은 구체적으로 말하지 말 것. (일기에 "비"가 없으면 비 얘기 금지)
- 날짜나 횟수를 나열하지 말 것. 감정이 어떻게 흘러왔는지가 느껴지게.
- 일기 속 구체적인 장면을 한두 개 그대로 빌려 올 것 (바꾸거나 부풀리지 말 것).
- 담백하고 서정적으로. 과장된 시어나 교훈조("~해야겠다")는 금지.
- 슬픈 기억이 있으면 억지로 밝게 끝내지 말 것.

일기들:
${diaryLines.join('\n')}`;

  try {
    // temperature 낮춤(차분하게) + thinking 끄기(속도) / 혼잡하면 자동 재시도
    const result = await geminiGenerate({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.6,
        thinkingConfig: { thinkingBudget: 0 },
      },
    }, 30000); // 30초 타임아웃

    if (!result.ok) {
      console.error('Gemini 회고 오류:', result.status, String(result.body).slice(0, 300));
      lastStoryError = friendlyAiError(result.status); // 사용자에겐 친절한 한 줄
      return null;
    }
    const text = result.data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) { lastStoryError = friendlyAiError(0); return null; }
    const parsed = JSON.parse(text);
    return (parsed.story || '').trim() || null;
  } catch (err) {
    console.error('Gemini 회고 실패:', err.message);
    lastStoryError = friendlyAiError(0);
    return null;
  }
}

// 가장 최근 회고 실패 사유 (진단용)
let lastStoryError = null;
function getLastStoryError() { return lastStoryError; }

module.exports = { analyzeDiary, writeStory, EMOTIONS, getLastStoryError };
