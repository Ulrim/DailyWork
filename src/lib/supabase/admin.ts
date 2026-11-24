import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./env";

/**
 * service_role 키를 쓰는 관리자 클라이언트. RLS 를 우회하므로
 * 호출 전에 반드시 요청자의 권한을 확인해야 한다 (계정 생성·비밀번호 초기화 전용).
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았습니다.");
  return createClient(supabaseEnv().url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
