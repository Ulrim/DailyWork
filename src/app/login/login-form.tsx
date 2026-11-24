"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/form";
import { login } from "./actions";

export function LoginForm({ notice }: { notice?: string }) {
  const [error, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="space-y-4">
      <Field label="이메일" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="username" inputMode="email" required autoFocus />
      </Field>
      <Field label="비밀번호" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <FormError message={error ?? notice} />
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "로그인 중…" : "로그인"}
      </Button>
    </form>
  );
}
