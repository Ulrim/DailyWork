// 로컬 개발 스택 게이트웨이: Supabase 의 단일 주소(/auth/v1, /rest/v1, /storage/v1)를 흉내 낸다.
// /storage/v1 은 Supabase Storage 의 대체 구현으로, storage.objects 의 RLS 정책을 그대로 적용한다.
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import pg from "pg";

const PORT = Number(process.env.GATEWAY_PORT ?? 54321);
const AUTH = process.env.AUTH_URL ?? "http://127.0.0.1:9999";
const REST = process.env.REST_URL ?? "http://127.0.0.1:3001";
const SECRET = process.env.JWT_SECRET;
const STORAGE_DIR = process.env.STORAGE_DIR;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 });

const b64url = (buf) => Buffer.from(buf).toString("base64url");
function sign(payload) {
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", SECRET).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}
function verify(token) {
  const [head, body, sig] = (token ?? "").split(".");
  if (!sig) return null;
  const expected = crypto.createHmac("sha256", SECRET).update(`${head}.${body}`).digest("base64url");
  if (expected.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  const claims = JSON.parse(Buffer.from(body, "base64url").toString());
  if (claims.exp && claims.exp < Date.now() / 1000) return null;
  return claims;
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "access-control-expose-headers": "*",
};
const json = (res, status, data) => {
  res.writeHead(status, { ...CORS, "content-type": "application/json" });
  res.end(JSON.stringify(data));
};
const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });

async function proxy(req, res, target, prefix) {
  const url = target + req.url.slice(prefix.length);
  const body = ["GET", "HEAD"].includes(req.method) ? undefined : await readBody(req);
  const headers = { ...req.headers };
  delete headers.host;
  delete headers["content-length"];
  const upstream = await fetch(url, { method: req.method, headers, body, redirect: "manual" });
  const out = { ...CORS };
  upstream.headers.forEach((v, k) => {
    if (!["content-encoding", "transfer-encoding", "content-length", "connection"].includes(k) && !k.startsWith("access-control-")) out[k] = v;
  });
  res.writeHead(upstream.status, out);
  res.end(Buffer.from(await upstream.arrayBuffer()));
}

/** 요청자의 JWT 권한(RLS 적용)으로 쿼리를 실행한다. */
async function asCaller(claims, fn) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`set local role ${claims.role === "service_role" ? "service_role" : "authenticated"}`);
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
const filePath = (bucket, name) => {
  const full = path.resolve(STORAGE_DIR, bucket, name);
  if (!full.startsWith(path.resolve(STORAGE_DIR) + path.sep)) throw new Error("invalid path");
  return full;
};

async function storage(req, res, pathname, search) {
  const parts = pathname.split("/").filter(Boolean).map(decodeURIComponent); // object, ...
  if (parts[0] !== "object") return json(res, 404, { message: "not found" });

  // 서명 URL 로 파일 내려받기
  if (req.method === "GET" && parts[1] === "sign") {
    const claims = verify(search.get("token"));
    const [bucket, ...rest] = parts.slice(2);
    const name = rest.join("/");
    if (!claims || claims.url !== `${bucket}/${name}`) return json(res, 400, { message: "invalid token" });
    const full = filePath(bucket, name);
    if (!fs.existsSync(full)) return json(res, 404, { message: "Object not found" });
    const meta = await pool.query("select metadata from storage.objects where bucket_id = $1 and name = $2", [bucket, name]);
    res.writeHead(200, { ...CORS, "content-type": meta.rows[0]?.metadata?.mimetype ?? "application/octet-stream", "cache-control": "private, max-age=3600" });
    return fs.createReadStream(full).pipe(res);
  }

  const claims = verify((req.headers.authorization ?? "").replace(/^Bearer /i, ""));
  if (!claims || !["authenticated", "service_role"].includes(claims.role)) {
    return json(res, 401, { statusCode: "401", error: "Unauthorized", message: "로그인이 필요합니다" });
  }
  const body = await readBody(req);
  const denied = (error) =>
    json(res, 400, { statusCode: "403", error: "Unauthorized", message: error.message.includes("row-level security") ? "new row violates row-level security policy" : error.message });

  try {
    // 서명 URL 발급 (단건/다건). 조회 권한은 storage.objects 의 select 정책으로 판단한다.
    if (req.method === "POST" && parts[1] === "sign") {
      const payload = JSON.parse(body.toString() || "{}");
      const bucket = parts[2];
      const single = parts.length > 3 ? parts.slice(3).join("/") : null;
      const names = single ? [single] : (payload.paths ?? []);
      const visible = await asCaller(claims, async (c) =>
        (await c.query("select name from storage.objects where bucket_id = $1 and name = any($2)", [bucket, names])).rows.map((r) => r.name),
      );
      const make = (name) => {
        const token = sign({ url: `${bucket}/${name}`, exp: Math.floor(Date.now() / 1000) + Number(payload.expiresIn ?? 3600) });
        return `/object/sign/${bucket}/${name.split("/").map(encodeURIComponent).join("/")}?token=${token}`;
      };
      if (single) {
        return visible.length ? json(res, 200, { signedURL: make(single) }) : json(res, 400, { statusCode: "404", error: "not_found", message: "Object not found" });
      }
      return json(res, 200, names.map((name) => visible.includes(name) ? { path: name, signedURL: make(name), error: null } : { path: name, signedURL: null, error: "Either the object does not exist or you do not have access to it" }));
    }

    // 업로드
    if (req.method === "POST") {
      const [bucket, ...rest] = parts.slice(1);
      const name = rest.join("/");
      let data = body;
      let mimetype = req.headers["content-type"] ?? "application/octet-stream";
      if (mimetype.startsWith("multipart/form-data")) {
        const form = await new Response(body, { headers: { "content-type": mimetype } }).formData();
        const file = [...form.values()].find((v) => typeof v !== "string");
        if (!file) return json(res, 400, { message: "파일이 없습니다" });
        data = Buffer.from(await file.arrayBuffer());
        mimetype = file.type || "application/octet-stream";
      }
      const bucketRow = (await pool.query("select * from storage.buckets where id = $1", [bucket])).rows[0];
      if (!bucketRow) return json(res, 400, { statusCode: "404", error: "Bucket not found", message: "Bucket not found" });
      if (bucketRow.file_size_limit && data.length > Number(bucketRow.file_size_limit)) {
        return json(res, 400, { statusCode: "413", error: "Payload too large", message: "The object exceeded the maximum allowed size" });
      }
      if (bucketRow.allowed_mime_types && !bucketRow.allowed_mime_types.includes(mimetype)) {
        return json(res, 400, { statusCode: "415", error: "invalid_mime_type", message: `mime type ${mimetype} is not supported` });
      }
      const row = await asCaller(claims, async (c) =>
        (await c.query(
          "insert into storage.objects (bucket_id, name, owner, metadata) values ($1, $2, $3, $4) returning id",
          [bucket, name, claims.sub ?? null, JSON.stringify({ mimetype, size: data.length })],
        )).rows[0],
      );
      const full = filePath(bucket, name);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, data);
      return json(res, 200, { Id: row.id, Key: `${bucket}/${name}` });
    }

    // 삭제
    if (req.method === "DELETE") {
      const bucket = parts[1];
      const prefixes = JSON.parse(body.toString() || "{}").prefixes ?? [];
      const removed = await asCaller(claims, async (c) =>
        (await c.query("delete from storage.objects where bucket_id = $1 and name = any($2) returning name, id", [bucket, prefixes])).rows,
      );
      for (const r of removed) fs.rmSync(filePath(bucket, r.name), { force: true });
      return json(res, 200, removed);
    }
  } catch (error) {
    return denied(error);
  }
  return json(res, 404, { message: "not found" });
}

http
  .createServer(async (req, res) => {
    try {
      if (req.method === "OPTIONS") {
        res.writeHead(204, CORS);
        return res.end();
      }
      const url = new URL(req.url, "http://localhost");
      if (url.pathname.startsWith("/auth/v1")) return await proxy(req, res, AUTH, "/auth/v1");
      if (url.pathname.startsWith("/rest/v1")) return await proxy(req, res, REST, "/rest/v1");
      if (url.pathname.startsWith("/storage/v1")) return await storage(req, res, url.pathname.slice("/storage/v1".length), url.searchParams);
      json(res, 404, { message: "not found" });
    } catch (error) {
      json(res, 502, { message: String(error) });
    }
  })
  .listen(PORT, () => console.log(`dev-stack gateway: http://127.0.0.1:${PORT}`));
