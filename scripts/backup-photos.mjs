// 현장 사진 파일 백업: report_photos 에 기록된 모든 사진을 내려받는다.
//   node --env-file=.env.local scripts/backup-photos.mjs [저장 폴더]
// 이미 받은 파일은 건너뛰므로 같은 폴더로 반복 실행하면 증분 백업이 된다.
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "report-photos";
const outDir = process.argv[2] ?? "backups/photos";
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let from = 0;
let saved = 0;
let skipped = 0;
const failed = [];
for (;;) {
  const { data, error } = await supabase.from("report_photos").select("storage_path").order("created_at").range(from, from + 999);
  if (error) throw new Error(error.message);
  if (data.length === 0) break;
  for (const { storage_path } of data) {
    const target = path.join(outDir, storage_path);
    if (fs.existsSync(target)) {
      skipped++;
      continue;
    }
    const { data: blob, error: downloadError } = await supabase.storage.from(BUCKET).download(storage_path);
    if (downloadError) {
      failed.push(storage_path);
      continue;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, Buffer.from(await blob.arrayBuffer()));
    saved++;
  }
  from += data.length;
}
console.log(`사진 백업: 새로 받은 파일 ${saved}개, 건너뜀 ${skipped}개, 실패 ${failed.length}개 → ${outDir}`);
if (failed.length) {
  console.error("받지 못한 파일:\n" + failed.join("\n"));
  process.exit(1);
}
