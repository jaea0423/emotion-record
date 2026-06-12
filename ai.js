// ai.js - Gemini API를 호출해서 일기를 요약(제목)하고 감정을 분류
require('dotenv').config();

// 우리 서비스의 9가지 감정 (이 목록 밖의 감정은 존재할 수 없음)
const EMOTIONS = ['기쁨', '사랑', '설렘', '평온', '슬픔', '불안', '화남', '지침', '그저 그런 날'];

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

/**
 * 일기 본문을 받아 { title, emotion } 을 돌려준다.
 * Gemini가 실패하면 fallback(기본값)으로 처리해서 서비스가 멈추지 않게 한다.
 */
async function analyzeDiary(content) {
  // 실패했을 때 쓸 기본값: 첫 문장 일부를 제목으로, 감정은 '그저 그런 날'
  const fallback = {
    title: content.trim().split('\n')[0].slice(0, 20),
    emotion: '그저 그런 날',
    fromAI: false, // AI 분석 실패 표시 (프론트에서 안내용)
  };

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fallback; // 키가 없으면 바로 기본값

  // Gemini에게 보낼 지시문(프롬프트)
  const prompt = `너는 일기 분석가다. 아래 일기를 읽고 JSON으로만 답해라. 다른 말은 절대 하지 마라.
형식: {"title": "감성적인 한 줄 제목 (한국어, 15자 이내)", "emotion": "아래 9개 중 정확히 하나"}
감정 목록: ${EMOTIONS.join(', ')}
애매하면 emotion은 "그저 그런 날"로 해라.

일기:
${content}`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        // JSON만 답하도록 강제하는 옵션
        generationConfig: { responseMimeType: 'application/json' },
      }),
    });

    if (!res.ok) {
      console.error('Gemini API 오류:', res.status, await res.text());
      return fallback;
    }

    const data = await res.json();
    // Gemini 응답 구조에서 텍스트 꺼내기
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return fallback;

    const parsed = JSON.parse(text); // JSON 형식이 깨졌으면 catch로 떨어짐

    // AI가 목록에 없는 감정을 답하면 기본값으로 교정 (예외 감정 차단)
    const emotion = EMOTIONS.includes(parsed.emotion) ? parsed.emotion : '그저 그런 날';
    const title = (parsed.title || fallback.title).slice(0, 30);

    return { title, emotion, fromAI: true };
  } catch (err) {
    console.error('Gemini 분석 실패:', err.message);
    return fallback;
  }
}

module.exports = { analyzeDiary, EMOTIONS };
