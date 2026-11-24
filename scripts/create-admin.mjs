// 초기 관리자(회장/대표이사) 계정을 만든다. 운영 환경 최초 설정 시 1회 실행한다.
//
//   node --env-file=.env.local scripts/create-admin.mjs --email ceo@example.com --name "홍길동" --role ceo
//
// 비밀번호는 --password 로 지정하거나, 생략하면 임시 비밀번호를 생성해 한 번만 출력한다.
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, all) => (cur.startsWith("--") ? [...acc, [cur.slice(2), all[i + 1]]] : acc), []),
);
const { email, name, role = "ceo" } = args;
if (!email || !name || !["chairman", "ceo"].includes(role)) {
  console.error('사용법: node --env-file=.env.local scripts/create-admin.mjs --email <이메일> --name "<이름>" --role <chairman|ceo> [--password <비밀번호>]');
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.");
  process.exit(1);
}
const password = args.password ?? crypto.randomBytes(12).toString("base64url");
if (password.length < 8) {
  console.error("비밀번호는 8자 이상이어야 합니다.");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const { data, error } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: name, company: "주식회사 컬리버" },
});
if (error) {
  console.error("계정 생성 실패:", error.message);
  process.exit(1);
}
const { error: roleError } = await supabase.from("profiles").update({ global_role: role }).eq("id", data.user.id);
if (roleError) {
  console.error("역할 지정 실패:", roleError.message);
  process.exit(1);
}
console.log(`관리자 계정을 만들었습니다: ${email} (${role === "chairman" ? "회장" : "대표이사"})`);
if (!args.password) console.log(`임시 비밀번호: ${password}\n로그인 후 계정 관리에서 비밀번호를 변경해 주세요.`);
