# 식당 원격 웨이팅 서비스

웹서비스설계 Term Project (개인)

> 손님이 식당에 가지 않고도 웨이팅을 등록해 순번을 받고, 사장님이 선착순으로 호출·입장·노쇼를 처리하는 서비스입니다.

- 저장소: https://github.com/se00000/web-term
- 보고서: [docs/report.pdf](docs/report.pdf) *(작성 예정)*
- 배포 주소: *(JCloud 배포 후 기재)*

## 사용 기술

| 구분 | 기술 |
|---|---|
| 서버 | Node.js 24, Express 5 |
| DB | SQLite (Node 내장 `node:sqlite`) |
| 인증 | JWT (HS256, 2시간), 비밀번호 `crypto.scrypt` + salt 해시 |
| 테스트 | `node:test` (서버를 임시 DB로 띄워 실제 HTTP로 검증) |
| 화면 | React 18 + React Router (Vite), `client/` — 빌드 결과를 Express가 같은 주소에서 서빙 |

## 계정 종류와 로그인

손님과 사장님은 **가입·로그인 화면과 API가 분리**되어 있습니다.

| 계정 | 가입 / 로그인 화면 | API | 로그인 후 |
|---|---|---|---|
| 손님 (`CUSTOMER`) | `/signup`, `/login` | `/api/auth/customer/signup`, `/api/auth/customer/login` | 매장 목록, 웨이팅 등록, 내 번호표 |
| 사장님 (`OWNER`) | `/owner/signup`, `/owner/login` | `/api/auth/owner/signup`, `/api/auth/owner/login` | 매장 등록·관리, 대기열 처리 |

- 계정 종류는 **요청 본문이 아니라 호출한 경로**로 정해집니다. 손님 가입 요청에 `role`을 넣으면 400으로 거절합니다.
- 비밀번호가 맞아도 계정 종류가 다른 로그인 화면이면 토큰을 주지 않습니다(403 `WRONG_ACCOUNT_TYPE`). 화면은 맞는 로그인으로 안내합니다.
- 비밀번호를 먼저 확인하므로, 비밀번호를 모르는 사람에게는 계정이 손님인지 사장님인지 드러나지 않습니다(항상 401).
- 한 이메일은 하나의 계정 종류로만 가입할 수 있습니다.
- 사장님 화면(`/owner`)은 상단 바 색이 달라 손님 화면과 구분됩니다.

> 제한사항: 사장님 가입 시 사업자등록 확인은 하지 않습니다. 실제 서비스라면 사업자 인증 후 사장님 권한을 부여해야 합니다.

## 역할과 핵심 규칙

| 행동 | 주체 | 허용 조건 |
|---|---|---|
| 웨이팅 등록 | 손님 | 매장 접수 중, 인원 1~매장 최대, **진행 중 웨이팅이 없음(전체 매장 통틀어 1개)**, 노쇼 제한 기간 아님 |
| 인원 변경 | 등록한 본인 | **WAITING일 때만**(호출 후에는 매장이 자리를 준비하므로 거절), 1~매장 최대 인원. 순번 유지, 변경 이력 기록 |
| 취소 | 등록한 본인 | WAITING 또는 CALLED |
| 호출 | 그 사장님 | WAITING이고 **대기 중 맨 앞 순번** |
| 입장 | 그 사장님 | CALLED |
| 노쇼 | 그 사장님 | CALLED이고 호출 후 10분 경과 → 다음 순번 자동 호출 |
| 영업 종료 | 그 사장님 | 접수 마감 + 남은 웨이팅 일괄 종료 |

- 노쇼가 최근 30일 안에 2회가 되면 7일 동안 등록할 수 없습니다.
- 상태: `WAITING → CALLED → SEATED`, `WAITING/CALLED → CANCELLED`, `CALLED → NO_SHOW`. 종료 상태(SEATED·CANCELLED·NO_SHOW)는 변경할 수 없습니다.
- 매장 삭제는 이력 보존을 위해 **비활성화**로 처리하며, 진행 중 웨이팅이 있으면 거절합니다.

## 식당 찾기

상단 메뉴바에서 **전체 매장 / 지역으로 찾기 / 음식 종류로 찾기**를 고릅니다. (사장님 화면에서는 숨김)

- 매장마다 **시·도**(17개 고정 목록), **구·군**(자유 입력), **음식 종류**(12개 고정 목록)를 가집니다. 목록은 [src/catalog.js](src/catalog.js) 한곳에 있고, 화면은 `GET /api/catalog`로 받아 메뉴를 그립니다.
- 지역으로 찾기: 시·도 → 구·군 → 매장 목록. 음식 종류로 찾기: 종류 → (선택) 지역으로 좁히기.
- 고른 조건은 주소(`/region?sido=전북&district=덕진구`)에 남아 새로고침·뒤로 가기·링크 공유에도 유지됩니다.
- 메뉴 옆 숫자는 영업 중인 매장 수이고, 매장이 없는 항목은 흐리게 표시됩니다.
- 서버는 목록에 없는 지역·종류, 지원하지 않는 검색 조건을 400으로 거절합니다. 검색어의 `%`, `_`는 글자 그대로 찾습니다.
- 이 컬럼이 없던 예전 DB는 서버가 열 때 자동으로 컬럼을 추가합니다(기본값 전북 / 기타).

## 실행 방법

Node.js **24.x**가 필요합니다.

```sh
npm ci
npm run build             # client/ 설치 + 빌드 → client/dist
cp .env.example .env      # 값 채우기 (JWT_SECRET, SEED_PASSWORD 등)
npm run db:seed           # 시연용 계정·매장 생성
npm start                 # http://HOST:PORT 에서 화면과 API 모두 제공
```

### 개발 모드 (화면 수정 시)

터미널 두 개에서 실행합니다. Vite 개발 서버가 `/api` 요청을 Express(3000)로 넘깁니다.

```sh
npm run dev               # API 서버 (PORT=3000 기준)
npm run client:dev        # http://localhost:5173
```

### 화면 구성

| 화면 | 경로 | 대상 |
|---|---|---|
| 전체 매장 + 이름·주소 검색 (대기 팀 수 10초 갱신) | `/` | 누구나 |
| 지역으로 찾기 (시·도 → 구·군) | `/region` | 누구나 |
| 음식 종류로 찾기 (종류 → 지역) | `/category` | 누구나 |
| 매장 상세 · 웨이팅 등록 | `/stores/:id` | 손님 |
| 내 웨이팅 번호표 (내 앞 팀 수 5초 갱신, 취소) | `/me` | 손님 |
| 손님 로그인 · 회원가입 | `/login`, `/signup` | 손님 |
| 사장님 로그인 · 회원가입 | `/owner/login`, `/owner/signup` | 사장님 |
| 매장 관리 (접수 열기·닫기, 호출·입장·노쇼, 영업 종료, 매장 등록·수정·닫기) | `/owner` | 사장님 |

화면은 맨 앞이 아닌 순번의 호출 버튼을 비활성화하는 등 안내만 하고, 모든 규칙은 서버에서 다시 검사합니다. 예를 들어 노쇼 버튼은 10분 전에도 누를 수 있지만 서버가 거절하고 그 이유를 화면에 보여줍니다.

### 환경변수 (`.env`)

| 이름 | 설명 |
|---|---|
| `PORT` | 서버 포트 (기본 3000) |
| `HOST` | 외부 접속은 `0.0.0.0`, 로컬만은 `127.0.0.1` (기본) |
| `JWT_SECRET` | JWT 서명 키, 32자 이상. 운영(`NODE_ENV=production`)에서는 필수 |
| `DB_PATH` | SQLite 파일 경로 (기본 `data/app.sqlite`) |
| `SEED_PASSWORD` | `db:seed`가 만드는 시연 계정 공통 비밀번호 |

비밀값은 저장소에 넣지 않습니다. 역할별 테스트 계정 정보는 LMS 제출란에 적습니다.

### DB 초기화

```sh
npm run db:reset -- --yes   # 서버를 끈 상태에서 DB 파일 삭제
npm run db:seed             # 다시 시드
```

## 테스트

```sh
npm test
```

테스트마다 임시 DB와 서버를 새로 띄우고, 시계를 주입해 "호출 후 10분", "7일 제한" 같은 시간 규칙도 검증합니다.

| 분류 | 검증 내용 |
|---|---|
| 정상 흐름 | 등록 → 호출 → 입장, 이력 기록, 내 앞 대기 팀 수 |
| 선착순·중복 | 동시 등록 20건 → 순번 1~20 중복·누락 없음 / 같은 손님 5연타 → 1건 / 다른 매장 동시 웨이팅 거절 / DB 유니크 인덱스 최종 방어 |
| 입력·상태 오류 | 잘못된 인원, 접수 마감, 종료된 웨이팅 변경, 호출 전 입장·노쇼, 맨 앞이 아닌 손님 호출 |
| 로그인 분리 | 손님·사장님 가입 각각 성공, 다른 종류 로그인 403(토큰 미발급), 틀린 비밀번호는 종류와 무관하게 401, 본문 role 주입 거절, 이메일 중복 409 |
| 권한 | 남의 웨이팅 취소, 손님의 호출, 다른 사장님의 호출·목록 조회, 사장님의 웨이팅 등록 |
| 트랜잭션 | 노쇼 처리 중 다음 순번 호출 실패 → 노쇼·이력까지 전부 롤백 / 인원 변경 이력 저장 실패 → 인원 변경도 롤백 |
| 인원 변경 | 대기 중 본인 변경 성공·순번 유지, 같은 값 반복 시 이력 1건, 다른 손님·사장님 403, 호출 후·종료 후 409, 0명·최대 초과·문자열·다른 필드 끼워넣기 400 |
| 식당 찾기 | 시·도 / 시·도+구·군 / 음식 종류 / 종류+지역 필터, 검색어 특수문자 처리, 잘못된 값 400, 메뉴용 매장 수(닫은 매장 제외), 매장 등록 시 지역·종류 필수, 예전 DB 자동 컬럼 추가 |
| 기타 | 노쇼 누적 제한과 해제, 영업 종료 일괄 처리, 지난 영업일 웨이팅 자동 만료, 매장 비활성화 |

## API 요약

| 메서드 | 경로 | 권한 |
|---|---|---|
| POST | `/api/auth/customer/signup`, `/api/auth/customer/login` | 공개 (손님) |
| POST | `/api/auth/owner/signup`, `/api/auth/owner/login` | 공개 (사장님) |
| GET | `/api/me` | 로그인 |
| GET | `/api/catalog` (지역·음식 종류 목록과 매장 수) | 공개 |
| GET | `/api/stores?sido=&district=&category=&q=` (모두 선택), `/api/stores/:id` | 공개 |
| POST | `/api/stores/:id/waitings` `{partySize}` | 손님 |
| GET | `/api/me/waiting` | 로그인 |
| PATCH | `/api/waitings/:id` `{partySize}` (인원 변경) | 본인 |
| POST | `/api/waitings/:id/cancel` | 본인 |
| GET | `/api/waitings/:id/history` | 본인·사장님 |
| GET/POST | `/api/owner/stores` | 사장님 |
| PATCH/DELETE | `/api/owner/stores/:id` | 사장님 |
| POST | `/api/owner/stores/:id/close-day` | 사장님 |
| GET | `/api/owner/stores/:id/waitings` | 사장님 |
| POST | `/api/owner/waitings/:id/call` · `seat` · `no-show` | 사장님 |

오류 응답 형식: `{ "code": "ALREADY_WAITING", "message": "..." }`

## 프로젝트 구조

```text
src/
  app.js                    라우트·입력 검증·오류 응답
  auth.js                   회원가입·로그인·JWT 검증
  db.js                     스키마, 트랜잭션 도우미(BEGIN IMMEDIATE)
  time.js                   한국 시간 영업일 계산
  services/waiting-service.js  웨이팅 업무 규칙
  catalog.js                시·도·음식 종류 고정 목록
  services/store-service.js    매장 관리·검색
scripts/  seed.js, reset-db.js
tests/    auth, store, waiting 테스트
client/
  src/api.js                API 호출·토큰 보관·오류 처리
  src/auth.jsx              로그인 상태 (토큰 만료 시 자동 로그아웃)
  src/accountTypes.js       손님/사장님 화면 문구·경로
  src/components/StoreCards.jsx  매장 카드 목록 (전체·지역·음식 종류 화면 공통)
  src/hooks.js              주기적 갱신(polling)
  src/pages/                화면별 컴포넌트
```
