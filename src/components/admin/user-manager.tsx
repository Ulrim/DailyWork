"use client";

import { Search, UserPlus, UserRoundPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  addMemberByEmail, createUser, resetUserPassword, setGlobalRole, setProjectRole, setUserActive, updateUser,
} from "@/app/(app)/admin/users/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, FormError, FormNotice, Input, Select } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/misc";
import { GLOBAL_ROLE_LABEL, ROLE_LABEL, type Tone } from "@/lib/constants";
import type { ActionResult, GlobalRole, ProjectRole } from "@/lib/types";

export interface UserRow {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  company: string | null;
  position: string | null;
  global_role: GlobalRole | null;
  is_active: boolean;
  project_role: ProjectRole | null;
}

const ROLE_TONE: Record<string, Tone> = {
  chairman: "purple", ceo: "purple", site_manager: "green", site_worker: "blue", partner: "amber",
};

function roleBadge(user: UserRow) {
  if (user.global_role) return <Badge tone={ROLE_TONE[user.global_role]}>{GLOBAL_ROLE_LABEL[user.global_role]}</Badge>;
  if (user.project_role) return <Badge tone={ROLE_TONE[user.project_role]}>{ROLE_LABEL[user.project_role]}</Badge>;
  return <Badge>미소속</Badge>;
}

/** 서버 액션 실행 공통 처리 */
function useAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  function run(action: () => Promise<ActionResult>, success?: string | (() => void)) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setNotice(null);
        return setError(result.error);
      }
      setError(null);
      if (typeof success === "function") success();
      else setNotice(success ?? null);
      router.refresh();
    });
  }
  const reset = () => {
    setError(null);
    setNotice(null);
  };
  return { pending, error, notice, run, reset, setError };
}

export function UserManager({
  users,
  me,
  isExecutive,
  hasProject,
}: {
  users: UserRow[];
  me: string;
  isExecutive: boolean;
  hasProject: boolean;
}) {
  const [keyword, setKeyword] = useState("");
  const [creating, setCreating] = useState(false);
  const [adding, setAdding] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = users.find((u) => u.id === selectedId) ?? null;

  const filtered = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    if (!k) return users;
    return users.filter((u) => [u.full_name, u.email, u.company, u.position].some((v) => v?.toLowerCase().includes(k)));
  }, [users, keyword]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-48">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" aria-hidden />
          <Input aria-label="계정 검색" placeholder="이름, 이메일, 소속 검색" className="pl-9" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
        </div>
        {hasProject && (
          <Button variant="outline" onClick={() => setAdding(true)}>
            <UserRoundPlus /> 기존 계정 추가
          </Button>
        )}
        <Button onClick={() => setCreating(true)}>
          <UserPlus /> 계정 만들기
        </Button>
      </div>

      <Card>
        {filtered.length === 0 ? (
          <EmptyState title="계정이 없습니다" description={keyword ? "검색 조건에 맞는 계정이 없습니다." : "계정 만들기로 첫 계정을 등록해 주세요."} />
        ) : (
          <ul className="divide-y divide-gray-100" data-testid="user-list">
            {filtered.map((user) => (
              <li key={user.id} className="flex items-center gap-3 px-4 py-3.5" data-email={user.email}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-[15px] font-semibold text-gray-900">{user.full_name}</span>
                    {roleBadge(user)}
                    {!user.is_active && <Badge tone="red">사용 중지</Badge>}
                    {user.id === me && <Badge tone="gray">본인</Badge>}
                  </div>
                  <p className="mt-0.5 break-all text-sm text-gray-600">{user.email}</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {[user.company, user.position, user.phone].filter(Boolean).join(" · ") || "소속 정보 없음"}
                  </p>
                </div>
                {user.id !== me && (isExecutive || user.project_role === "site_worker" || user.project_role === "partner") && (
                  <Button variant="outline" size="sm" onClick={() => setSelectedId(user.id)} aria-label={`${user.full_name} 관리`}>
                    관리
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Dialog open={creating} onOpenChange={setCreating}>
        {creating && <CreateDialog isExecutive={isExecutive} hasProject={hasProject} onDone={() => setCreating(false)} />}
      </Dialog>
      <Dialog open={adding} onOpenChange={setAdding}>
        {adding && <AddDialog isExecutive={isExecutive} onDone={() => setAdding(false)} />}
      </Dialog>
      <Dialog open={selected !== null} onOpenChange={(v) => !v && setSelectedId(null)}>
        {selected && <ManageDialog key={selected.id} user={selected} isExecutive={isExecutive} hasProject={hasProject} />}
      </Dialog>
    </div>
  );
}

function roleOptions(isExecutive: boolean, hasProject: boolean) {
  const options: { value: string; label: string }[] = [];
  if (hasProject) {
    options.push({ value: "site_worker", label: "현장팀" }, { value: "partner", label: "협력업체" });
    if (isExecutive) options.push({ value: "site_manager", label: "현장관리자" });
  }
  if (isExecutive) options.push({ value: "ceo", label: "대표이사" }, { value: "chairman", label: "회장" });
  return options;
}

function CreateDialog({ isExecutive, hasProject, onDone }: { isExecutive: boolean; hasProject: boolean; onDone: () => void }) {
  const { pending, error, run } = useAction();
  const options = roleOptions(isExecutive, hasProject);
  const [form, setForm] = useState({
    email: "", password: "", full_name: "", phone: "", company: "", position: "", role: options[0]?.value ?? "",
  });
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <DialogContent title="계정 만들기" description="만든 계정의 이메일과 초기 비밀번호를 당사자에게 전달해 주세요.">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => createUser(form), onDone);
        }}
      >
        <Field label="이름" htmlFor="new-name" required>
          <Input id="new-name" value={form.full_name} onChange={set("full_name")} maxLength={50} required />
        </Field>
        <Field label="이메일 (로그인 아이디)" htmlFor="new-email" required>
          <Input id="new-email" type="email" inputMode="email" autoComplete="off" value={form.email} onChange={set("email")} required />
        </Field>
        <Field label="초기 비밀번호" htmlFor="new-password" required hint="8자 이상">
          <Input id="new-password" type="text" autoComplete="off" value={form.password} onChange={set("password")} minLength={8} maxLength={72} required />
        </Field>
        <Field label="역할" htmlFor="new-role" required hint={hasProject ? "사업장 역할은 현재 선택된 사업장에 적용됩니다." : undefined}>
          <Select id="new-role" value={form.role} onChange={set("role")}>
            {options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="소속" htmlFor="new-company">
            <Input id="new-company" value={form.company} onChange={set("company")} maxLength={100} />
          </Field>
          <Field label="직책" htmlFor="new-position">
            <Input id="new-position" value={form.position} onChange={set("position")} maxLength={50} />
          </Field>
        </div>
        <Field label="연락처" htmlFor="new-phone">
          <Input id="new-phone" type="tel" inputMode="tel" value={form.phone} onChange={set("phone")} maxLength={30} />
        </Field>
        <FormError message={error} />
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "만드는 중…" : "계정 만들기"}
        </Button>
      </form>
    </DialogContent>
  );
}

function AddDialog({ isExecutive, onDone }: { isExecutive: boolean; onDone: () => void }) {
  const { pending, error, run } = useAction();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("site_worker");
  return (
    <DialogContent title="기존 계정 추가" description="이미 계정이 있는 사용자를 현재 사업장 구성원으로 추가합니다.">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => addMemberByEmail(email, role), onDone);
        }}
      >
        <Field label="이메일" htmlFor="add-email" required>
          <Input id="add-email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="역할" htmlFor="add-role" required>
          <Select id="add-role" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="site_worker">현장팀</option>
            <option value="partner">협력업체</option>
            {isExecutive && <option value="site_manager">현장관리자</option>}
          </Select>
        </Field>
        <FormError message={error} />
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "추가 중…" : "사업장에 추가"}
        </Button>
      </form>
    </DialogContent>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-gray-100 pt-4 first:border-0 first:pt-0">
      <h3 className="mb-2.5 text-sm font-semibold text-gray-900">{title}</h3>
      {children}
    </section>
  );
}

function ManageDialog({ user, isExecutive, hasProject }: { user: UserRow; isExecutive: boolean; hasProject: boolean }) {
  const { pending, error, notice, run } = useAction();
  const [profile, setProfile] = useState({
    full_name: user.full_name, phone: user.phone ?? "", company: user.company ?? "", position: user.position ?? "",
  });
  const [projectRole, setProjectRoleValue] = useState<string>(user.project_role ?? "");
  const [globalRole, setGlobalRoleValue] = useState<string>(user.global_role ?? "");
  const [password, setPassword] = useState("");
  const set = (key: keyof typeof profile) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setProfile((p) => ({ ...p, [key]: e.target.value }));

  return (
    <DialogContent title={`${user.full_name} 계정 관리`} description={user.email}>
      <div className="space-y-4">
        <FormError message={error} />
        {!error && <FormNotice message={notice} />}

        <Section title="기본 정보">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => updateUser(user.id, profile), "기본 정보를 저장했습니다.");
            }}
          >
            <Field label="이름" htmlFor="edit-name" required>
              <Input id="edit-name" value={profile.full_name} onChange={set("full_name")} maxLength={50} required />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="소속" htmlFor="edit-company">
                <Input id="edit-company" value={profile.company} onChange={set("company")} maxLength={100} />
              </Field>
              <Field label="직책" htmlFor="edit-position">
                <Input id="edit-position" value={profile.position} onChange={set("position")} maxLength={50} />
              </Field>
            </div>
            <Field label="연락처" htmlFor="edit-phone">
              <Input id="edit-phone" type="tel" inputMode="tel" value={profile.phone} onChange={set("phone")} maxLength={30} />
            </Field>
            <Button type="submit" variant="secondary" className="w-full" disabled={pending}>기본 정보 저장</Button>
          </form>
        </Section>

        {hasProject && !user.global_role && (
          <Section title="현재 사업장 역할">
            <div className="flex gap-2">
              <Select aria-label="사업장 역할" value={projectRole} onChange={(e) => setProjectRoleValue(e.target.value)}>
                <option value="">미소속 (사업장에서 제외)</option>
                <option value="site_worker">현장팀</option>
                <option value="partner">협력업체</option>
                {isExecutive && <option value="site_manager">현장관리자</option>}
              </Select>
              <Button
                variant="secondary"
                className="shrink-0"
                disabled={pending || projectRole === (user.project_role ?? "")}
                onClick={() => {
                  if (!projectRole && !confirm("이 사업장에서 제외할까요? 제외하면 이 사업장의 데이터를 볼 수 없습니다.")) return;
                  run(() => setProjectRole(user.id, projectRole || null), "사업장 역할을 변경했습니다.");
                }}
              >
                변경
              </Button>
            </div>
          </Section>
        )}

        {isExecutive && (
          <Section title="전사 역할">
            <div className="flex gap-2">
              <Select aria-label="전사 역할" value={globalRole} onChange={(e) => setGlobalRoleValue(e.target.value)}>
                <option value="">없음</option>
                <option value="ceo">대표이사</option>
                <option value="chairman">회장</option>
              </Select>
              <Button
                variant="secondary"
                className="shrink-0"
                disabled={pending || globalRole === (user.global_role ?? "")}
                onClick={() => {
                  if (!confirm(globalRole ? "전사 역할을 부여하면 모든 사업장의 데이터에 접근할 수 있습니다. 계속할까요?" : "전사 역할을 해제할까요?")) return;
                  run(() => setGlobalRole(user.id, globalRole || null), "전사 역할을 변경했습니다.");
                }}
              >
                변경
              </Button>
            </div>
            <p className="mt-1.5 text-xs text-gray-500">회장·대표이사는 모든 사업장을 조회하고 관리합니다.</p>
          </Section>
        )}

        <Section title="비밀번호 초기화">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                const result = await resetUserPassword(user.id, password);
                if (result.ok) setPassword("");
                return result;
              }, "비밀번호를 변경했습니다. 새 비밀번호를 당사자에게 전달해 주세요.");
            }}
          >
            <Input aria-label="새 비밀번호" type="text" autoComplete="off" placeholder="새 비밀번호 (8자 이상)" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} maxLength={72} required />
            <Button type="submit" variant="secondary" className="shrink-0" disabled={pending}>초기화</Button>
          </form>
        </Section>

        <Section title="계정 상태">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-gray-600">
              {user.is_active ? "사용 중인 계정입니다." : "사용이 중지된 계정입니다. 로그인할 수 없습니다."}
            </p>
            {user.is_active ? (
              <Button
                variant="dangerOutline"
                className="shrink-0"
                disabled={pending}
                onClick={() => confirm("이 계정의 사용을 중지할까요? 중지하면 로그인과 데이터 조회가 모두 차단됩니다.") && run(() => setUserActive(user.id, false), "계정 사용을 중지했습니다.")}
              >
                사용 중지
              </Button>
            ) : (
              <Button className="shrink-0" disabled={pending} onClick={() => run(() => setUserActive(user.id, true), "계정을 다시 사용할 수 있습니다.")}>
                사용 재개
              </Button>
            )}
          </div>
        </Section>
      </div>
    </DialogContent>
  );
}
