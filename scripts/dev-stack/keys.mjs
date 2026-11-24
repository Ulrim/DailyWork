// 로컬 개발 스택용 키(JWT)를 출력한다. 운영 키가 아니다.
import crypto from "node:crypto";

const secret = process.argv[2];
const b64 = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
function key(role) {
  const data = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ role, iss: "dev-stack", iat: 1700000000, exp: 4102444800 })}`;
  return `${data}.${crypto.createHmac("sha256", secret).update(data).digest("base64url")}`;
}
console.log(`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=${key("anon")}
SUPABASE_SERVICE_ROLE_KEY=${key("service_role")}`);
