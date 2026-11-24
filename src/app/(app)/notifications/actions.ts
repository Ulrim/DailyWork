"use server";

import { revalidatePath } from "next/cache";
import { toMessage } from "@/lib/errors";
import { getSession } from "@/lib/session";
import type { ActionResult } from "@/lib/types";
import { uuidSchema } from "@/lib/validation";

export async function markNotificationRead(id: string): Promise<ActionResult> {
  const { supabase, userId } = await getSession();
  if (!uuidSchema.safeParse(id).success) return { ok: false, error: "잘못된 요청입니다." };
  const { error } = await supabase.from("notifications").update({ is_read: true }).eq("id", id).eq("user_id", userId);
  if (error) return { ok: false, error: toMessage(error) };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  const { supabase, userId } = await getSession();
  const { error } = await supabase.from("notifications").update({ is_read: true }).eq("user_id", userId).eq("is_read", false);
  if (error) return { ok: false, error: toMessage(error) };
  revalidatePath("/", "layout");
  return { ok: true };
}
