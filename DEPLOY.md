# 배포 가이드 (Render + Neon · 교수님 제출용 링크)

데이터를 외부 공용 DB(Neon PostgreSQL)에 저장하도록 바꿨습니다. 그래서 이제 **어디서 로그인하든 같은 데이터**가 보이고, **서버가 재시작돼도 일기·계정이 사라지지 않습니다.**

전체 흐름: ① Neon DB 만들기 → ② 로컬에서 동작 확인 → ③ GitHub 푸시 → ④ Render 환경변수에 DB 주소 추가 → 끝.

알아둘 점
- **첫 접속이 느림**: Render 무료 플랜은 15분 미접속 시 잠들고, 다음 접속 때 깨는 데 ~1분 걸립니다. (제출 직전에 한 번 미리 접속해 깨워두면 교수님이 볼 때 바로 떠요.)
- **사진은 예외**: 일기·계정·노래 링크 같은 **글자 데이터는 Neon에 영구 저장**됩니다. 다만 업로드한 **사진 파일**은 아직 Render 디스크(휘발성)에 저장돼서 재시작 시 사라질 수 있어요. (사진까지 영구 보관하려면 별도 작업 필요 — 필요하면 말씀하세요.)

---

## 1단계 — Neon DB 만들기 (무료, 10분)

1. https://neon.tech 접속 → **Sign up** (GitHub 계정으로 로그인 추천)
2. 새 프로젝트 생성 (이름 아무거나, 지역은 가까운 곳 예: `Singapore` 또는 `Asia`)
3. 프로젝트가 생기면 **Connection string**(연결 문자열)이 보입니다. `postgresql://...` 로 시작하는 그 한 줄을 **복사**하세요.
   - "Connection string" 또는 "Connect" 버튼 → `psql`/`Node.js`용 문자열 중 아무거나 (형식 같음)
   - `?sslmode=require`가 끝에 붙어 있어도 그대로 둡니다.

이 문자열이 곧 **`DATABASE_URL`** 입니다. 외부에 노출되면 안 되는 비밀값이에요.

---

## 2단계 — 로컬에서 먼저 확인 (권장)

DB 방식이 크게 바뀌었으니, 배포 전에 내 컴퓨터에서 한 번 돌려보는 걸 권합니다.

1. 프로젝트 폴더(`C:\GitHub\emotion-record`)에서 새 라이브러리 설치:
   ```bash
   npm install
   ```
2. `.env` 파일을 열어 맨 아래에 줄 하나 추가 (1단계에서 복사한 값):
   ```
   DATABASE_URL=postgresql://...복사한_연결_문자열...
   ```
3. 더미 데이터 채우기 → 서버 실행:
   ```bash
   npm run seed
   npm start
   ```
4. 브라우저에서 `http://localhost:3000` → `test / 1234`로 로그인해서 지도·일기가 보이면 성공.

> `npm run seed`는 test 계정이 이미 있으면 그냥 넘어갑니다. 처음부터 다시 채우고 싶으면 Neon 대시보드(SQL Editor)에서 데이터를 지운 뒤 다시 실행하세요.

---

## 3단계 — GitHub에 올리기

PowerShell에서는 `&&`가 안 되니 **한 줄씩** 실행:

```powershell
git add -A
git commit -m "DB를 PostgreSQL(Neon)로 전환 + 평범 이름변경 등"
git push
```

- `.env`, `memory.db`, 업로드 사진은 `.gitignore`라 **자동 제외**됩니다(비밀값 안 새어나감).
- `git push`에서 인증을 물으면 GitHub 비밀번호가 아니라 **개인 액세스 토큰(PAT)**.

---

## 4단계 — Render에 DB 주소 추가

이미 Render에 배포돼 있으니, **환경변수 하나만 추가**하면 됩니다.

1. https://render.com → 대시보드 → 이 서비스(`memory-footprint`) 클릭
2. 왼쪽 **Environment** 탭 → **Add Environment Variable**
3. 아래를 추가하고 저장:

| 키 이름 | 넣을 값 |
|---|---|
| `DATABASE_URL` | 1단계에서 복사한 Neon 연결 문자열 (`postgresql://...`) |

- `KAKAO_JS_KEY`, `GEMINI_API_KEY`는 이미 들어 있을 거예요(없으면 같이 넣기).
- 저장하면 Render가 자동으로 재배포합니다. (처음 시작 시 seed가 돌아 test 계정·일기를 Neon에 채웁니다.)

> 처음부터 새로 만드는 경우엔: New + → Blueprint → 레포 연결 → `render.yaml`이 자동으로 읽힘 → `DATABASE_URL`/`KAKAO_JS_KEY`/`GEMINI_API_KEY` 입력 → Apply.

---

## 5단계 — 카카오 도메인 (이미 하셨으면 통과)

카카오 JS 지도는 **등록된 도메인에서만** 작동합니다. 카카오 개발자 사이트 → 앱 → **플랫폼 키 → JavaScript 키 → JavaScript SDK 도메인**에 배포 주소(`https://memory-footprint.onrender.com`)가 들어 있어야 합니다. (`http://localhost:3000`은 그대로 둠)

---

## 잘 안 될 때

| 증상 | 확인할 것 |
|---|---|
| 서버가 안 켜짐 / "DB 초기화 실패" 로그 | `DATABASE_URL` 오타 확인. Neon 문자열을 통째로(따옴표 없이) 넣었는지 |
| 지도가 회색/빈 화면 | 카카오 "JavaScript SDK 도메인"에 배포 주소 등록했는지 (`https://` 포함) |
| 로그인 안 됨 | `test / 1234`. 안 되면 Render Logs에서 seed가 돌았는지 확인 |
| AI 제목/감정이 항상 기본값 | `GEMINI_API_KEY` 오타 확인 (Render → Environment) |
| 첫 접속이 1분 넘게 걸림 | 무료 플랜 콜드스타트라 정상 |

> 교수님 제출 직전에 한 번 미리 접속해서 서버를 깨워 두면 바로 뜹니다.
