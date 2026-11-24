-- 현장 사진 저장소 (비공개 버킷)
-- 경로 규칙: {project_id}/{report_id}/{파일명}

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'report-photos', 'report-photos', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 조회: 해당 작업일보를 볼 수 있는 사용자 (daily_reports RLS 적용)
create policy report_photos_object_select on storage.objects for select to authenticated
  using (
    bucket_id = 'report-photos'
    and exists (
      select 1 from public.daily_reports r
      where r.id::text = (storage.foldername(name))[2]
        and r.project_id::text = (storage.foldername(name))[1]
    )
  );

-- 업로드/삭제: 작성중·보완 요청 상태인 본인 작업일보에만
create policy report_photos_object_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'report-photos'
    and exists (
      select 1 from public.daily_reports r
      where r.id::text = (storage.foldername(name))[2]
        and r.project_id::text = (storage.foldername(name))[1]
        and public.can_edit_report(r.id)
    )
  );

create policy report_photos_object_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'report-photos'
    and exists (
      select 1 from public.daily_reports r
      where r.id::text = (storage.foldername(name))[2]
        and r.project_id::text = (storage.foldername(name))[1]
        and public.can_edit_report(r.id)
    )
  );
