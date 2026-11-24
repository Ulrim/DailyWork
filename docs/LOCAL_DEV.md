# 로컬 개발 환경

## 방법 A. Supabase CLI (Docker 필요, 권장)

```bash
npm install
npx supabase start          # 로컬 Supabase 실행 + supabase/migrations 적용
npx supabase status         # API URL, anon key, service_role key 확인 → .env.local 에 기록
echo "APP_ENV=development" >> .env.local
npm run seed:dev            # 테스트 계정·예시 데이터
npm run dev                 # http://localhost:3000
```

## 방법 B. Docker 없이 실행 (scripts/dev-stack)

Docker 를 쓸 수 없는 환경을 위한 대체 구성이다. 로컬 PostgreSQL 16 위에 Supabase 의 인증 서버(GoTrue)와
REST 서버(PostgREST)를 직접 띄우고, 저장소(Storage)는 `scripts/dev-stack/gateway.mjs` 의 대체 구현을 쓴다.
대체 저장소도 `storage.objects` 의 RLS 정책을 그대로 적용하지만 실제 Supabase Storage 와 완전히 같지는 않으므로,
사진 업로드는 스테이징 Supabase 프로젝트에서 한 번 더 확인한다.

### 실행 파일 준비 (최초 1회)

```bash
mkdir -p .dev-stack/bin .dev-stack/auth
# PostgREST (https://github.com/PostgREST/postgrest/releases)
curl -L https://github.com/PostgREST/postgrest/releases/download/v12.2.3/postgrest-v12.2.3-linux-static-x64.tar.xz | tar -xJ -C .dev-stack/bin
# Supabase Auth (https://github.com/supabase/auth/releases)
curl -L https://github.com/supabase/auth/releases/download/v2.177.0/auth-v2.177.0-x86.tar.gz | tar -xz -C .dev-stack/auth
```

로컬 PostgreSQL 에 슈퍼유저 `culiver_test`(비밀번호 `culiver_test`)가 필요하다. 다른 계정을 쓰려면 `DEV_DB_SUPER_URL` 환경변수로 지정한다.

```sql
create role culiver_test login superuser password 'culiver_test';
```

### 실행

```bash
npm run stack:start         # 기동. 출력되는 3줄을 .env.local 에 넣고 APP_ENV=development 추가
npm run seed:dev            # 테스트 데이터
npm run dev
npm run stack:reset         # DB 를 지우고 마이그레이션부터 다시
npm run stack:stop
```

## 테스트 계정 (seed:dev)

공통 비밀번호 `Culiver!2026`

| 이메일 | 역할 |
| --- | --- |
| chairman@culiver.test | 회장 |
| ceo@culiver.test | 대표이사 |
| manager@culiver.test | 현장관리자 |
| worker1@culiver.test, worker2@, worker3@ | 현장팀 |
| partner@culiver.test | 협력업체 |

시드 스크립트는 `APP_ENV` 가 development/staging 이고, 대상 DB 에 사업장이 하나도 없을 때만 동작한다.
