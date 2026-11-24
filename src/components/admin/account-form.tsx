"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { changeMyPassword, updateMyProfile } from "@/app/(app)/admin/account/actions";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormError, FormNotice, Input } from "@/components/ui/form";

interface ProfileValues {
  full_name: string;
  phone: string;
  company: string;
  position: string;
}

export function AccountForm({ initial }: { initial: ProfileValues }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [profile, setProfile] = useState(initial);
  const [profileMessage, setProfileMessage] = useState<{ error?: string; notice?: string }>({});
  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });
  const [passwordMessage, setPasswordMessage] = useState<{ error?: string; notice?: string }>({});
  const set = (key: keyof ProfileValues) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setProfile((p) => ({ ...p, [key]: e.target.value }));
  const setPw = (key: keyof typeof passwords) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setPasswords((p) => ({ ...p, [key]: e.target.value }));

  return (
    <div className="grid gap-4 md:grid-cols-2 md:items-start">
      <Card>
        <CardHeader title="기본 정보" />
        <CardBody>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const result = await updateMyProfile(profile);
                setProfileMessage(result.ok ? { notice: "저장했습니다." } : { error: result.error });
                if (result.ok) router.refresh();
              });
            }}
          >
            <Field label="이름" htmlFor="my-name" required>
              <Input id="my-name" value={profile.full_name} onChange={set("full_name")} maxLength={50} required />
            </Field>
            <Field label="소속" htmlFor="my-company">
              <Input id="my-company" value={profile.company} onChange={set("company")} maxLength={100} />
            </Field>
            <Field label="직책" htmlFor="my-position">
              <Input id="my-position" value={profile.position} onChange={set("position")} maxLength={50} />
            </Field>
            <Field label="연락처" htmlFor="my-phone">
              <Input id="my-phone" type="tel" inputMode="tel" value={profile.phone} onChange={set("phone")} maxLength={30} />
            </Field>
            <FormError message={profileMessage.error} />
            <FormNotice message={profileMessage.notice} />
            <Button type="submit" size="lg" className="w-full" disabled={pending}>저장</Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="비밀번호 변경" />
        <CardBody>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (passwords.next !== passwords.confirm) {
                return setPasswordMessage({ error: "새 비밀번호가 서로 일치하지 않습니다." });
              }
              startTransition(async () => {
                const result = await changeMyPassword(passwords.current, passwords.next);
                if (result.ok) setPasswords({ current: "", next: "", confirm: "" });
                setPasswordMessage(result.ok ? { notice: "비밀번호를 변경했습니다." } : { error: result.error });
              });
            }}
          >
            <Field label="현재 비밀번호" htmlFor="pw-current" required>
              <Input id="pw-current" type="password" autoComplete="current-password" value={passwords.current} onChange={setPw("current")} required />
            </Field>
            <Field label="새 비밀번호" htmlFor="pw-next" required hint="8자 이상">
              <Input id="pw-next" type="password" autoComplete="new-password" value={passwords.next} onChange={setPw("next")} minLength={8} maxLength={72} required />
            </Field>
            <Field label="새 비밀번호 확인" htmlFor="pw-confirm" required>
              <Input id="pw-confirm" type="password" autoComplete="new-password" value={passwords.confirm} onChange={setPw("confirm")} minLength={8} maxLength={72} required />
            </Field>
            <FormError message={passwordMessage.error} />
            <FormNotice message={passwordMessage.notice} />
            <Button type="submit" size="lg" className="w-full" disabled={pending}>비밀번호 변경</Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
