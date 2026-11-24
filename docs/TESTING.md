# 테스트

| 종류 | 명령 | 대상 | 필요 환경 |
| --- | --- | --- | --- |
| 단위 | `npm run test:unit` | 날짜·작업시간 계산, 입력 검증, 보고서 집계 | 없음 |
| DB | `npm run test:db` | 역할별 권한(RLS), 중복 제출, 상태 전환, 공정률, 통합 취합 | 로컬 PostgreSQL 16 |
| E2E | `npm run test:e2e` | 모바일·PC 브라우저에서 실제 화면 흐름 | 로컬 스택 + 테스트 데이터 |

## DB 테스트

`tests/db/global-setup.ts` 가 테스트 전용 DB(`culiver_test`)를 새로 만들고 `supabase/migrations` 를 그대로 적용한 뒤,
각 테스트가 실제 사용자 권한(`authenticated` 역할 + JWT `sub`)으로 SQL 을 실행한다.
Supabase 가 제공하는 `auth`·`storage` 스키마는 `tests/db/supabase-shim.sql` 로 최소한만 흉내 낸다.
DB 이름이 `_test` 로 끝나지 않으면 실행을 거부하므로 운영 DB 를 지울 수 없다.

```bash
# 접속 주소 기본값: postgres://culiver_test:culiver_test@localhost:5432/culiver_test
TEST_DATABASE_URL=postgres://user:pass@localhost:5432/culiver_test npm run test:db
```

## E2E 테스트

하루 1건 제한이 있어 **실행할 때마다 데이터를 초기화**해야 한다.

```bash
npm run stack:reset && npm run seed:dev
npm run test:e2e                                   # 개발 서버를 자동으로 띄운다
# 운영 빌드로 검증
npm run build && npm run start &
E2E_BASE_URL=http://localhost:3000 npm run test:e2e
```

## 검수 항목과 해당 테스트

| 검수 항목 | 테스트 |
| --- | --- |
| 역할별 접근 권한 | `tests/db/permissions.test.ts` (17건): 비로그인 차단, 사업장 간 격리, 협력업체 제한, 현장팀의 관리 기능 차단, 현장관리자 지정 제한, 비활성 계정 차단, 이력·알림 보호, 사진 저장소 정책 / E2E: 관리자 화면 차단, 협력업체 화면, 역할 조작 요청 거부 |
| 중복 제출 | `tests/db/reports.test.ts` "중복 제출": 하루 1건 유일 제약, 재제출 거부, 작업내역 없는 제출·미래 날짜 거부 / E2E "중복 제출 방지" |
| 데이터 입력 검증 | `tests/unit/validation.test.ts`, `tests/db/reports.test.ts` "입력 검증"(DB 제약), E2E: 시간 역전, 실적률 범위, 기한 역전, 비밀번호 길이 |
| 승인·보완·수정 요청 이력 | `tests/db/reports.test.ts` "승인 및 보완 요청", "승인 완료 후 수정 요청과 변경 이력" / E2E "승인 완료 후 수정" |
| 공정률 산출 | `tests/db/progress-consolidation.test.ts` "공정률 산출": 가중 평균, 계획 공정률, 가중치 0, 과거 일자 기준, 지연 판정 / E2E: 승인 후 공정 실적률 반영 |
| 보고서 자동 취합 | `tests/db/progress-consolidation.test.ts` "통합 작업일보·보고서 자동 취합", `tests/unit/aggregate.test.ts` / E2E: 승인 전후 통합 작업일보·일간·주간·월간 보고서 |
| 모바일 화면 | E2E `mobile.spec.ts`(iPhone 13 크기): 하단 메뉴, 10개 화면 가로 넘침 없음, 작성·사진·제출 |

## 최근 실행 결과 (2026-11-24)

| 구분 | 결과 |
| --- | --- |
| 단위 테스트 | 25건 통과 |
| DB 테스트 | 49건 통과 |
| E2E (개발 서버 / 운영 빌드) | 13건 통과 / 13건 통과 |
| `npm run build`, `npm run typecheck` | 통과 |
| 백업·복원 연습 | 로컬 DB 에서 데이터 삭제 후 복원, 빈 DB 로 계정 포함 이전, 사진 파일 복원 — 건수 일치 확인 |

검증 환경의 한계: 로컬 스택의 사진 저장소는 Supabase Storage 의 대체 구현이고(같은 RLS 정책 적용), 실제 Supabase 클라우드 프로젝트에는 아직 연결해 보지 않았다.
스테이징 프로젝트를 만든 뒤 `docs/DEPLOYMENT.md` 7번 점검표로 한 번 더 확인한다.
