import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "로그인" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  return (
    <main className="flex min-h-dvh items-center justify-center bg-brand-900 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center text-white">
          <p className="text-sm font-medium tracking-[0.3em] text-brand-200">CULIVER</p>
          <h1 className="mt-2 text-2xl font-bold">스마트팜 통합 현장관리</h1>
          <p className="mt-2 text-sm text-brand-200">주식회사 컬리버</p>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-xl">
          <LoginForm notice={reason === "inactive" ? "사용이 중지된 계정입니다. 관리자에게 문의해 주세요." : undefined} />
          <p className="mt-4 text-center text-xs text-gray-500">계정 발급·비밀번호 초기화는 현장관리자에게 요청해 주세요.</p>
        </div>
      </div>
    </main>
  );
}
