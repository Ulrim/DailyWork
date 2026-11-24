"use server";

import { redirect } from "next/navigation";
import { toMessage } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { firstIssue, loginSchema } from "@/lib/validation";

export async function login(_prev: string | null, formData: FormData): Promise<string | null> {
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return firstIssue(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return toMessage(error);

  const { data: profile } = await supabase.from("profiles").select("is_active").eq("id", data.user.id).maybeSingle();
  if (!profile?.is_active) {
    await supabase.auth.signOut();
    return "사용이 중지된 계정입니다. 관리자에게 문의해 주세요.";
  }
  redirect("/dashboard");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
