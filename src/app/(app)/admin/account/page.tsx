import type { Metadata } from "next";
import { AccountForm } from "@/components/admin/account-form";
import { PageHeader } from "@/components/ui/misc";
import { GLOBAL_ROLE_LABEL, ROLE_LABEL } from "@/lib/constants";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "내 계정" };

export default async function AccountPage() {
  const { profile, role, project } = await getSession();
  const roleLabel = profile.global_role ? GLOBAL_ROLE_LABEL[profile.global_role] : role ? ROLE_LABEL[role] : "소속 없음";
  return (
    <>
      <PageHeader title="내 계정" description={`${profile.email} · ${roleLabel}${project && !profile.global_role ? ` (${project.name})` : ""}`} />
      <AccountForm
        initial={{
          full_name: profile.full_name,
          phone: profile.phone ?? "",
          company: profile.company ?? "",
          position: profile.position ?? "",
        }}
      />
    </>
  );
}
