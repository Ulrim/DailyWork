import { redirect } from "next/navigation";
import { Card, CardBody } from "@/components/ui/card";
import { getSession } from "@/lib/session";

export default async function NoProjectPage() {
  const session = await getSession();
  if (session.project && session.role) redirect("/dashboard");
  return (
    <Card className="mx-auto mt-10 max-w-md">
      <CardBody className="text-center">
        <h1 className="text-lg font-semibold text-gray-900">배정된 사업장이 없습니다</h1>
        <p className="mt-2 text-sm text-gray-600">
          {session.isExecutive
            ? "사업장 관리에서 첫 사업장을 등록해 주세요."
            : "현장관리자에게 사업장 배정을 요청해 주세요."}
        </p>
        {session.isExecutive && (
          <a href="/admin/projects" className="mt-4 inline-block font-semibold text-brand-700 underline">
            사업장 관리로 이동
          </a>
        )}
      </CardBody>
    </Card>
  );
}
