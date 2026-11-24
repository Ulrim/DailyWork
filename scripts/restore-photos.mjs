// 현장 사진 파일 복원: backup-photos.mjs 로 받은 폴더를 저장소에 다시 올린다.
//   node --env-file=.env.local scripts/restore-photos.mjs [백업 폴더]
// 이미 있는 파일은 덮어쓰지 않는다.
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "report-photos";
const dir = process.argv[2] ?? "backups/photos";
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const TYPES = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif" };

const files = fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile());
let uploaded = 0;
let existing = 0;
const failed = [];
for (const entry of files) {
  const full = path.join(entry.parentPath, entry.name);
  const key = path.relative(dir, full).split(path.sep).join("/");
  const contentType = TYPES[entry.name.split(".").pop().toLowerCase()] ?? "application/octet-stream";
  const { error } = await supabase.storage.from(BUCKET).upload(key, fs.readFileSync(full), { contentType, upsert: false });
  if (!error) uploaded++;
  else if (/exists|duplicate/i.test(error.message)) existing++;
  else failed.push(`${key}: ${error.message}`);
}
console.log(`사진 복원: 올린 파일 ${uploaded}개, 이미 있음 ${existing}개, 실패 ${failed.length}개`);
if (failed.length) {
  console.error(failed.join("\n"));
  process.exit(1);
}
