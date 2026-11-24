"use server";

import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { toMessage } from "@/lib/errors";
import { getSession } from "@/lib/session";
import { supabaseEnv } from "@/lib/supabase/env";
import type { ActionResult } from "@/lib/types";
import { firstIssue, passwordSchema, userUpdateSchema } from "@/lib/validation";

export async function updateMyProfile(input: unknown): Promise<ActionResult> {
  const { supabase, userId } = await getSession();
  const parsed = userUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const { data, error } = await supabase.from("profiles").update(parsed.data).eq("id", userId).select("id");
  if (error) return { ok: false, error: toMessage(error) };
  if (!data?.length) return { ok: false, error: "프로필을 저장하지 못했습니다." };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function changeMyPassword(current: string, next: string): Promise<ActionResult> {
  const { supabase, profile } = await getSession();
  const parsed = passwordSchema.safeParse(next);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  if (typeof current !== "string" || !current) return { ok: false, error: "현재 비밀번호를 입력해 주세요." };
  if (current === parsed.data) return { ok: false, error: "새 비밀번호가 현재 비밀번호와 같습니다." };

  // 현재 비밀번호 확인: 세션 쿠키에 영향을 주지 않는 별도 클라이언트로 검증한다
  const { url, anonKey } = supabaseEnv();
  const verifier = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: verifyError } = await verifier.auth.signInWithPassword({ email: profile.email, password: current });
  if (verifyError) return { ok: false, error: "현재 비밀번호가 올바르지 않습니다." };

  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) {
    console.error("[비밀번호 변경 오류]", error.message);
    return { ok: false, error: "비밀번호를 변경하지 못했습니다. 더 복잡한 비밀번호로 다시 시도해 주세요." };
  }
  return { ok: true };
}
