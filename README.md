# CULIVER 스마트팜 통합 현장관리 시스템

주식회사 컬리버의 고흥군 스마트팜 구축·운영 현장을 관리하는 웹 애플리케이션입니다.
현장 작업자는 개인 계정으로 작업일보를 작성·제출하고, 관리자는 업무 배정, 일정, 공정률, 현장 사진, 작업실적을 통합 관리합니다.

## 주요 기능

| 구분 | 내용 |
| --- | --- |
| 계정·권한 | 이메일 로그인, 관리자 계정 발급, 회장/대표이사/현장관리자/현장팀/협력업체 역할, 사업장별 권한(DB RLS) |
| 작업일보 | 하루 1건, 작업내역 여러 건, 사진 촬영·업로드, 임시저장·제출, 승인·보완 요청, 승인 후 수정 요청 |
| 업무 | 개인별 업무 배정, 진행상태·진행률, 작업일보와 연결 |
| 일정·공정 | 전체/개인 캘린더, 간트차트, 계획 대비 실적, 가중치 기반 전체 공정률 |
| 보고 | 승인된 일보 자동 취합 통합 작업일보, 일간·주간·월간 보고서 인쇄(PDF) |
| 관리 | 대시보드, 제출 현황, 알림, 변경 이력(전후 값) |

## 기술 구성

- Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui 방식 컴포넌트 · Pretendard
- Supabase (PostgreSQL, Auth, Storage) — 권한의 기준은 PostgreSQL RLS
- 한국어 UI, Asia/Seoul 기준, PC·모바일 반응형, 홈 화면 설치(PWA manifest)

## 빠른 시작

```bash
npm install
# 로컬 Supabase 준비: docs/LOCAL_DEV.md (Supabase CLI 또는 Docker 없는 dev-stack)
cp .env.example .env.local     # 값 채우기, APP_ENV=development
npm run seed:dev               # 테스트 계정·예시 데이터 (운영에서는 실행되지 않음)
npm run dev                    # http://localhost:3000
```

테스트 계정은 `docs/LOCAL_DEV.md` 를 참고하세요.

## 폴더 구조

```
supabase/migrations/   DB 마이그레이션 (테이블, 권한 함수, 트리거, RLS, 저장소 정책)
src/app/(app)/         로그인 후 화면 (대시보드, 작업일보, 업무, 캘린더, 공정, 보고서, 관리)
src/app/login/         로그인
src/components/        화면 컴포넌트 (ui: 공통, layout: 사이드바·상단바·하단 메뉴)
src/lib/               세션·권한 컨텍스트, Supabase 클라이언트, 입력 검증, 날짜 처리
scripts/               초기 관리자 생성, 테스트 데이터, 백업·복원, 로컬 스택
tests/                 unit(계산·검증), db(권한·업무 규칙), e2e(브라우저)
docs/                  배포, 백업·복원, 로컬 개발, 테스트, 설계서
```

## 명령어

| 명령 | 설명 |
| --- | --- |
| `npm run dev` / `build` / `start` | 개발 서버 / 빌드 / 운영 실행 |
| `npm run typecheck` · `npm run lint` | 타입 검사 · 린트 |
| `npm run test:unit` | 단위 테스트 (계산, 입력 검증, 보고서 집계) |
| `npm run test:db` | DB 테스트 (역할별 권한, 중복 제출, 공정률, 취합) — 로컬 PostgreSQL 필요 |
| `npm run test:e2e` | 브라우저 테스트 (모바일·PC) — 테스트 데이터가 들어 있는 개발 환경 필요 |
| `npm run seed:dev` | 테스트 데이터 넣기 (development/staging 전용) |
| `npm run stack:start` / `stack:reset` / `stack:stop` | Docker 없는 로컬 백엔드 |

## 문서

- [배포 매뉴얼](docs/DEPLOYMENT.md) — Supabase 프로젝트, 마이그레이션, 환경변수, 초기 관리자 계정, 배포
- [백업 및 복원](docs/BACKUP_RESTORE.md)
- [로컬 개발 환경](docs/LOCAL_DEV.md)
- [테스트](docs/TESTING.md)
- [설계서](docs/superpowers/specs/2026-11-24-culiver-field-management-design.md)

## 확장 방향

모든 사업 데이터가 `project_id` 를 기준으로 하고 권한 함수(`is_project_member`, `is_project_manager` 등)를 공유하므로,
자재·공사비·회의·설계·안전·재배일지·센서 데이터는 `project_id` 를 가진 새 테이블과 같은 형태의 RLS 정책,
`src/lib/nav.ts` 의 메뉴 항목, `src/app/(app)/` 아래 새 화면을 추가하는 방식으로 확장합니다.
