# 배포 매뉴얼

운영 환경은 **Supabase 프로젝트(DB·인증·사진 저장소)** 와 **Next.js 앱 서버** 두 부분으로 구성된다.
테스트용과 운영용은 반드시 **서로 다른 Supabase 프로젝트**를 쓴다.

| 환경 | Supabase 프로젝트 | APP_ENV | 테스트 데이터 |
| --- | --- | --- | --- |
| 로컬 개발 | 로컬 스택 (`docs/LOCAL_DEV.md`) | development | `npm run seed:dev` |
| 검수(스테이징) | `culiver-staging` | staging | `npm run seed:dev` 가능 |
| 운영 | `culiver-prod` | production | **넣지 않는다** (시드 스크립트가 실행을 거부한다) |

## 1. Supabase 프로젝트 만들기

1. https://supabase.com 에서 조직을 만들고 새 프로젝트를 생성한다. 리전은 **Northeast Asia (Seoul)** 을 권장한다.
2. 데이터베이스 비밀번호를 안전한 곳(비밀번호 관리자)에 보관한다. 백업·복원에 필요하다.
3. 운영 프로젝트는 유료 플랜(Pro 이상)을 권장한다. 무료 플랜은 일정 기간 미사용 시 일시 중지되고 자동 백업 보존 기간이 짧다.

## 2. DB 마이그레이션 적용

`supabase/migrations/` 의 SQL 파일이 테이블, 권한 함수, RLS 정책, 사진 저장소 버킷을 모두 만든다.

```bash
npx supabase login
npx supabase link --project-ref <프로젝트 ref>   # 대시보드 주소의 프로젝트 ID
npx supabase db push                             # 아직 적용되지 않은 마이그레이션만 적용
```

CLI 를 쓸 수 없으면 대시보드 **SQL Editor** 에서 파일 이름 순서대로(000001 → 000004) 내용을 붙여 넣어 실행한다.

적용 확인(SQL Editor):

```sql
select count(*) from pg_policies where schemaname = 'public';          -- 0 보다 커야 한다
select id, public from storage.buckets where id = 'report-photos';     -- public = false
```

## 3. 인증 설정 (대시보드 > Authentication)

- **이메일 로그인 사용**, **신규 가입 허용 끄기** (Allow new users to sign up: OFF). 계정은 앱의 계정 관리 화면에서만 만든다.
- URL Configuration 의 Site URL 을 운영 주소(예: `https://field.culiver.co.kr`)로 지정한다.
- 비밀번호 최소 길이는 8자 이상으로 둔다.

## 4. 환경변수

`.env.example` 을 참고해 배포 환경에 등록한다. (대시보드 > Project Settings > API)

| 이름 | 값 | 비고 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` | 공개 가능 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon 또는 publishable 키 | 공개 가능. RLS 로 보호된다 |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role(secret) 키 | **비밀.** 서버 환경변수로만 등록한다 |
| `APP_ENV` | `production` | 운영에서는 반드시 production |

service_role 키는 RLS 를 우회한다. 저장소에 커밋하거나 `NEXT_PUBLIC_` 접두사를 붙이지 않는다.
유출이 의심되면 대시보드에서 즉시 재발급하고 배포 환경변수를 교체한다.

## 5. 초기 관리자 계정 만들기

운영 DB 에는 테스트 계정이 없으므로 첫 관리자(회장 또는 대표이사)를 스크립트로 만든다.
운영 키가 담긴 `.env.production.local` 파일을 로컬에만 두고 실행한다(커밋 금지, `.gitignore` 대상).

```bash
node --env-file=.env.production.local scripts/create-admin.mjs \
  --email ceo@culiver.co.kr --name "홍길동" --role ceo
# --role: chairman(회장) | ceo(대표이사)
# --password 를 생략하면 임시 비밀번호를 한 번만 출력한다
```

이후 순서:

1. 만든 계정으로 로그인 → **사업장 관리**에서 사업장(예: `GH-SF-01` 고흥 스마트팜 1단지) 등록
2. **계정 관리**에서 현장관리자·현장팀·협력업체 계정 생성 (현장관리자 지정은 회장/대표이사만 가능)
3. **공정 관리**에서 공정과 가중치(합계 100 권장), 계획 기간 등록
4. 임시 비밀번호로 만든 계정은 **내 계정**에서 비밀번호를 변경

## 6. 앱 배포

### 방법 A. Vercel (권장)

1. GitHub 저장소를 Vercel 프로젝트로 가져온다. Framework 는 Next.js 로 자동 인식된다.
2. Environment Variables 에 4번의 값을 **Production** 환경으로 등록한다.
   검수용은 **Preview** 환경에 스테이징 프로젝트의 값을 등록한다.
3. Function Region 을 Seoul(`icn1`)로 지정하면 DB 와 가까워 응답이 빠르다.
4. 사용자 도메인을 연결하고 Supabase 의 Site URL 과 맞춘다.

### 방법 B. 자체 서버 (Node.js 22 이상)

```bash
git clone <저장소> && cd DailyWork
npm ci
# 환경변수는 .env.production.local 또는 서비스 관리자(systemd, pm2)에 등록
npm run build
npm run start -- -p 3000
```

- 앞단에 HTTPS 리버스 프록시(Nginx, Caddy 등)를 둔다. 휴대폰 카메라 촬영과 홈 화면 설치(PWA)는 HTTPS 에서만 동작한다.
- 프로세스는 systemd 나 pm2 로 상시 실행하고 서버 시간대와 무관하게 앱은 Asia/Seoul 기준으로 동작한다.

## 7. 배포 후 점검

- [ ] 관리자 로그인, 잘못된 비밀번호 로그인 거부
- [ ] 현장팀 계정으로 휴대폰에서 작업일보 작성 → 사진 촬영 업로드 → 제출
- [ ] 현장관리자 계정으로 승인 → 통합 작업일보·대시보드 공정률 반영
- [ ] 협력업체 계정으로 타인의 작업일보·전체 업무가 보이지 않는지 확인
- [ ] 보고서 인쇄(PDF 저장) 확인
- [ ] 휴대폰 브라우저의 "홈 화면에 추가"로 설치 확인
- [ ] 백업 1회 실행 및 복원 연습 (`docs/BACKUP_RESTORE.md`)

## 8. 업데이트 절차

1. 스키마 변경은 `supabase/migrations/` 에 **새 파일**로 추가한다(기존 파일은 수정하지 않는다).
2. 스테이징 프로젝트에 `supabase db push` → 검수.
3. 운영 반영 직전 DB 백업 → 운영 프로젝트에 `supabase db push` → 앱 배포.
4. 문제가 생기면 앱은 이전 배포로 되돌리고, DB 는 백업에서 복원한다.
