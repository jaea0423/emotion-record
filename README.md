# 👣 기억의 발자국

일기를 쓰면 AI가 한 줄 제목을 짓고 감정을 분류해서,
**지도(장소)와 달력(날짜)** 양쪽에 감정 표정으로 새겨지는 일기 사이트.

- 지도에서 장소를 누르면 → **"이 곳의 기억"** (시간순으로 쌓인 일기들)
- 달력에서 날짜를 누르면 → **"이 날의 기억"**
- 키워드 화면에서 자주 쓴 키워드가 한눈에, 누르면 그 키워드의 기억만 지도로

> 배포 데모: `https://memory-footprint.onrender.com` (데모 계정 `test` / `1234`)
> 무료 플랜이라 첫 접속은 깨어나는 데 ~1분 걸릴 수 있습니다.

## 기술 스택

| 영역 | 사용 기술 |
|---|---|
| 프론트엔드 | HTML / CSS / 순수 JavaScript (클린 & 큐트, 네이비 테마) |
| 백엔드 | Node.js + Express |
| DB | PostgreSQL (`pg`) — 클라우드 DB(Neon)에 영구 저장 |
| 이미지 | Cloudinary (업로드 사진 영구 보관) |
| 지도 | 카카오맵 JavaScript SDK (마커, 클러스터러, 장소 검색) |
| AI | Google Gemini API (일기 요약 + 감정 분류 + 회고 생성) |
| 음악 | 유튜브 / 스포티파이 oEmbed (링크만으로 제목·앨범표지·플레이어) |
| 인증 | express-session + bcryptjs (비밀번호 해시 저장) |
| 배포 | Render (웹 서비스) + Neon (DB) + Cloudinary (이미지) |

## 실행 전 준비 (키/연결 문자열 4개)

`.env.example`을 복사해 `.env`로 만들고 아래 값을 채웁니다. (발급 방법은 `DEPLOY.md` 참고)

| 환경변수 | 발급처 | 용도 |
|---|---|---|
| `KAKAO_JS_KEY` | https://developers.kakao.com (JavaScript 키) | 지도 |
| `GEMINI_API_KEY` | https://aistudio.google.com | AI 분석/회고 |
| `DATABASE_URL` | https://neon.tech (PostgreSQL 연결 문자열) | 데이터 저장 |
| `CLOUDINARY_URL` | https://cloudinary.com (API 환경변수) | 사진 저장 |

> 카카오 키는 **JavaScript SDK 도메인**에 사용할 주소(`http://localhost:3000`, 배포 주소)를 등록해야 지도가 뜹니다.
> `CLOUDINARY_URL`을 비워두면 사진은 로컬 `uploads/` 폴더에 저장됩니다(배포 시 사라질 수 있음).

## 실행 방법

```bash
# 0. Node.js 22 이상 권장 (node -v 로 확인)

# 1. 라이브러리 설치 (처음 1번만)
npm install

# 2. 시연용 더미 데이터 생성 (처음 1번만)
#    test 계정(비밀번호 1234)과 일기 232개가 DB에 만들어짐
npm run seed

# 3. 서버 실행
npm start

# 4. 브라우저에서 접속
#    http://localhost:3000/login.html
```

## 폴더 구조

```
emotion-record/
├─ server.js          # 서버 시작점 (DB 준비 후 Express 시작)
├─ db.js              # PostgreSQL(pg) 연결 + 테이블 생성 (+ 감정 이름 마이그레이션)
├─ ai.js              # Gemini API 호출 (제목 + 감정 분석 + 회고, 실패 시 fallback)
├─ seed.js            # 시연용 더미 데이터 생성 스크립트
├─ routes/
│  ├─ auth.js         # 회원가입(중복확인) / 로그인 / 로그아웃
│  └─ diaries.js      # 일기 CRUD + 제목/감정 수정 + 사진(Cloudinary) + 음악 oEmbed
├─ public/            # 프론트엔드 (브라우저에 그대로 전달되는 파일들)
│  ├─ login.html      # 로그인 / 회원가입
│  ├─ index.html      # 지도 메인 (표정 마커, 이 곳의 기억, 일기 상세)
│  ├─ write.html      # 일기 작성 (장소 검색, 사진, 음악, AI 결과 즉시 수정)
│  ├─ calendar.html   # 날짜별 보기 (기록 있는 날은 칸이 얼굴이 됨)
│  ├─ keywords.html   # 키워드 클라우드
│  ├─ album.html / music.html  # 사진/노래가 담긴 기억 보관함
│  ├─ css/style.css   # 클린 & 큐트(네이비) 테마 + 모바일 반응형
│  └─ js/             # common.js(공통: 표정 SVG/필터/내비), map.js, write.js, calendar.js, keywords.js
├─ render.yaml        # Render 배포 설정(Blueprint)
└─ DEPLOY.md          # 배포 가이드 (Render + Neon + Cloudinary)
```

## 핵심 설계

- **감정 9종**: 기쁨, 사랑, 설렘, 평온, 슬픔, 불안, 화남, 지침, 평범.
  AI가 목록 밖의 답을 하면 본문 단어로 추정해 교정 → 예외 감정이 구조적으로 불가능.
- **표정 마커**: 마커 = 그 장소의 대표 감정(빈도순) 표정 스티커. 크기 = 일기 개수,
  2개 이상이면 숫자 뱃지. 지도를 축소하면 클러스터러가 합쳐 줌.
- **캘린더 얼굴**: 기록이 있는 날은 칸 자체가 그 날의 얼굴
  (배경 = 대표 감정 색 + 눈코입 + 개수 뱃지). 날짜를 누르면 오른쪽 패널로 그 날의 기억.
- **기간 필터**: 상단에서 전체 / 1·3·6개월 / 기간 직접 설정 → 지도와 캘린더에 동시 적용.
  페이지를 옮겨도 유지됨 (localStorage).
- **AI 판단은 참고일 뿐**: 저장 직후 결과 카드에서, 그리고 기존 일기 상세에서
  제목(요약)과 감정을 언제든 직접 수정 가능 (`PUT /api/diaries/:id`).
- **AI 회고**: 여러 기억을 묶어 한 편의 글로. 같은 묶음은 캐시(`stories` 테이블)로 재사용.
- **보안**: 비밀번호는 bcrypt 해시로 저장, Gemini 키 등 비밀값은 서버(.env/환경변수)에만 존재.
- **안정성**: AI 분석이 실패해도 일기는 기본값(첫 문장 제목 + 단어로 추정한 감정)으로 저장됨.

## 자주 막히는 부분

| 증상 | 원인 / 해결 |
|---|---|
| 지도가 안 보임 | `KAKAO_JS_KEY` 확인, 카카오 **JavaScript SDK 도메인**에 접속 주소 등록했는지 확인 |
| 서버가 안 켜짐 / "DB 초기화 실패" | `DATABASE_URL`(Neon 연결 문자열) 오타·누락 확인 |
| AI 분석이 항상 기본값 | `GEMINI_API_KEY` 확인, 서버 콘솔의 에러 메시지 확인 |
| 사진이 재시작 후 사라짐 | `CLOUDINARY_URL`을 넣어야 영구 저장됨 (없으면 로컬 임시 저장) |
| 데이터 초기화하고 싶음 | Neon 대시보드(SQL Editor)에서 데이터 삭제 후 다시 `npm run seed` |
| 예전 데이터에 "분노"/"그저 그런 날"이 남아 있음 | 서버를 한 번 켜면 db.js가 자동으로 "화남"/"평범"으로 바꿔 줌 |
