# 데이터 백업 및 복원

백업 대상은 두 가지다.

| 대상 | 내용 | 방법 |
| --- | --- | --- |
| 데이터베이스 | 작업일보, 업무, 공정, 이력, 계정 등 | Supabase 자동 백업 + `scripts/backup-db.sh` |
| 사진 파일 | 저장소 버킷 `report-photos` | `scripts/backup-photos.mjs` |

DB 백업에는 사진의 **목록(경로)** 만 들어 있고 사진 파일 자체는 들어 있지 않다. 두 가지를 함께 백업해야 한다.

## 1. Supabase 자동 백업

- 유료 플랜은 매일 자동 백업되고 대시보드 **Database > Backups** 에서 복원할 수 있다.
- 분 단위 복구가 필요하면 PITR(Point-in-Time Recovery) 부가 기능을 켠다.
- 자동 백업은 같은 플랫폼 안에 보관되므로, 아래의 **별도 보관용 백업**을 주기적으로 함께 받는다.

## 2. 별도 보관용 백업 (권장: 매일 1회)

준비물: PostgreSQL 클라이언트(`pg_dump`, `pg_restore` — 서버와 같거나 높은 버전), Node.js 22.

DB 접속 주소는 대시보드 **Project Settings > Database > Connection string (URI, Session pooler 또는 Direct)** 에서 확인한다.

```bash
# 1) 데이터베이스
export SUPABASE_DB_URL="postgresql://postgres.<ref>:<DB비밀번호>@<호스트>:5432/postgres"
scripts/backup-db.sh backups            # → backups/culiver-db-YYYYMMDD-HHMMSS.dump

# 2) 사진 파일 (이미 받은 파일은 건너뛰는 증분 방식)
node --env-file=.env.production.local scripts/backup-photos.mjs backups/photos
```

- 백업 파일에는 개인정보와 계정 정보(암호화된 비밀번호)가 들어 있다. 접근이 제한된 저장 공간(사내 NAS, 암호화된 클라우드 저장소)에 보관한다.
- 보존 기준 예: 일간 14일, 주간 8주, 월간 12개월.
- cron 예시(매일 02:30):

```cron
30 2 * * * cd /opt/culiver && SUPABASE_DB_URL=... scripts/backup-db.sh /backup/culiver && node --env-file=.env.production.local scripts/backup-photos.mjs /backup/culiver/photos
```

## 3. 복원

### 3-1. 같은 프로젝트에서 데이터 사고 복구 (잘못된 대량 수정·삭제)

가장 안전한 방법은 대시보드의 자동 백업/PITR 복원이다. 별도 백업 파일로 되돌릴 때는:

```bash
export SUPABASE_DB_URL="postgresql://..."
scripts/restore-db.sh backups/culiver-db-20261124-023000.dump
```

- `public` 스키마(앱 데이터)를 백업 시점으로 되돌린다. 확인 문구 `RESTORE` 를 입력해야 실행된다.
- 백업 시점 이후에 만든 계정은 로그인 계정(auth)만 남고 프로필이 없어 로그인이 거부된다. 계정 관리에서 다시 만들거나 3-2 방식으로 계정까지 복원한다.

### 3-2. 새 프로젝트로 이전·복제 (재해 복구, 스테이징 복제)

```bash
# 1) 새 Supabase 프로젝트에 마이그레이션 적용
npx supabase link --project-ref <새 프로젝트 ref> && npx supabase db push

# 2) 계정과 데이터 넣기 (새 프로젝트가 비어 있어야 한다)
export SUPABASE_DB_URL="postgresql://...새 프로젝트..."
scripts/restore-db.sh backups/culiver-db-20261124-023000.dump --data-only

# 3) 사진 파일 올리기 (.env 는 새 프로젝트의 값)
node --env-file=.env.restore.local scripts/restore-photos.mjs backups/photos
```

`--data-only` 복원은 트리거를 끄고 넣기 위해 DB 소유자 권한(`postgres` 계정)이 필요하다.

### 3-3. 복원 후 확인

```sql
select count(*) from daily_reports;
select status, count(*) from daily_reports group by status;
select count(*) from report_photos;
select max(created_at) from audit_logs;   -- 백업 시점과 일치하는지
```

앱에서 로그인, 최근 작업일보와 사진 표시, 대시보드 공정률을 확인한다.

## 4. 복원 연습

백업은 복원해 봐야 믿을 수 있다. 분기 1회 스테이징 프로젝트에 3-2 절차로 복원해 보고 소요 시간과 결과를 기록한다.

## 5. 개별 데이터 되돌리기

단건 실수는 전체 복원 대신 **변경 이력** 화면에서 수정 전 값을 확인해 다시 입력한다.
`audit_logs` 테이블에는 모든 등록·수정·삭제의 전후 값이 남는다.

```sql
select created_at, action, changed_fields, old_data, new_data
from audit_logs
where table_name = 'daily_reports' and record_id = '<작업일보 id>'
order by created_at;
```
