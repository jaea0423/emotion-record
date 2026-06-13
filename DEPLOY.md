# 배포 가이드 (Render 무료 · 교수님 제출용 링크)

요약: ① 코드를 GitHub에 올리고 → ② Render에서 이 레포를 Blueprint로 연결 → ③ 키 2개 입력 → ④ 카카오에 배포 주소 등록. 끝나면 `https://...onrender.com` 링크가 생깁니다.

미리 알아둘 점 두 가지
- **첫 접속이 느림**: 무료 플랜은 15분 동안 아무도 안 들어오면 잠들고, 다음 접속 때 깨어나는 데 ~1분 걸립니다. (교수님께 "처음 한 번은 로딩이 좀 걸려요"라고 적어두면 좋아요.)
- **새 글은 사라질 수 있음**: 무료 플랜은 디스크가 휘발성이라 서버가 잠들었다 깨면 DB가 초기화됩니다. 대신 시작할 때마다 **데모 데이터(demo / 1234, 일기 232개)는 자동으로 다시 채워져서** 항상 보입니다. 시연용으론 충분합니다.

---

## 1단계 — GitHub에 올리기

VS Code 터미널(또는 명령 프롬프트)에서 프로젝트 폴더(`C:\GitHub\emotion-record`)로 이동한 뒤:

```bash
git add -A
git commit -m "온라인 배포 준비: 평범 이름변경, 패널/캘린더 개편, render.yaml 추가"
git push
```

- `git add -A` : 바뀐 파일 전부를 올릴 준비 (memory.db, 업로드 사진, .env는 .gitignore라 자동 제외됨 — 키가 새어나갈 걱정 없음)
- `git commit -m "..."` : 변경 사항을 한 묶음으로 기록
- `git push` : GitHub(`jaea0423/emotion-record`)로 전송

> 비밀번호를 물으면 GitHub 비밀번호가 아니라 **개인 액세스 토큰(PAT)**을 넣어야 합니다. 평소 쓰던 방식대로 하시면 됩니다.

---

## 2단계 — Render 가입 & 배포

1. https://render.com 접속 → **Get Started** → **GitHub 계정으로 로그인** (신용카드 필요 없음)
2. 오른쪽 위 **New +** → **Blueprint** 선택
3. `emotion-record` 레포를 고르고 **Connect**
4. Render가 레포 안의 `render.yaml`을 자동으로 읽어 설정을 채워 줍니다 → **Apply** (또는 **Create**)

---

## 3단계 — 키 2개 입력 (가장 중요)

배포를 누르면 Render가 값이 비어 있는 환경변수 2개를 물어봅니다. **여기는 직접 입력하셔야 합니다** (제가 대신 못 넣어요):

| 키 이름 | 넣을 값 |
|---|---|
| `KAKAO_JS_KEY` | 카카오 개발자 사이트의 **JavaScript 키** (로컬 `.env`에 있는 그 값) |
| `GEMINI_API_KEY` | Google AI Studio의 **Gemini API 키** (로컬 `.env`에 있는 그 값) |

- `SESSION_SECRET`, `GEMINI_MODEL`, `NODE_VERSION`은 `render.yaml`에 이미 설정돼 있어 자동으로 채워집니다.
- 로컬 `.env` 파일을 열면 두 키 값을 그대로 복사할 수 있습니다.

입력 후 **Deploy** → 2~4분 기다리면 `https://memory-footprint.onrender.com` 같은 주소가 생깁니다.

---

## 4단계 — 카카오에 배포 주소 등록 (이거 안 하면 지도가 안 떠요)

카카오 JS 키는 **등록된 도메인에서만** 작동합니다. 배포 주소를 카카오에 추가해야 합니다.

1. https://developers.kakao.com → 내 애플리케이션 → (이 프로젝트 앱) 선택
2. 왼쪽 **앱 설정 → 플랫폼 → Web** 으로 이동
3. **사이트 도메인 추가**에 배포 주소를 입력 (예: `https://memory-footprint.onrender.com`) → 저장
   - 기존의 `http://localhost:3000`은 그대로 두세요 (로컬 개발도 계속 됨)
4. 1~2분 뒤 배포 사이트를 새로고침하면 지도가 뜹니다.

---

## 잘 안 될 때

| 증상 | 확인할 것 |
|---|---|
| 지도가 회색/빈 화면 | 4단계 카카오 도메인 등록 했는지, 주소 오타 없는지 (`https://` 포함) |
| 페이지는 뜨는데 로그인 안 됨 | demo / 1234 로 시도. 안 되면 Render 로그(Logs 탭)에서 seed 실행됐는지 확인 |
| AI 제목/감정이 항상 기본값 | `GEMINI_API_KEY` 오타 확인 (Render → Environment 탭) |
| 빌드 실패 (sqlite 관련) | Render → Environment에 `NODE_VERSION=22.22.3` 있는지 확인 |
| 첫 접속이 1분 넘게 걸림 | 무료 플랜 콜드스타트라 정상. 한 번 깨우면 빨라집니다 |

> 교수님 제출 직전에 한 번 미리 접속해서 서버를 깨워 두면, 교수님이 보실 때 바로 뜹니다.
