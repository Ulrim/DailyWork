import Link from "next/link";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** 대시보드 상단의 숫자 지표 카드 */
export function StatCard({
  label,
  value,
  unit,
  sub,
  href,
  tone = "default",
  testId,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  sub?: React.ReactNode;
  href?: string;
  tone?: "default" | "alert" | "warn" | "good";
  testId?: string;
}) {
  const color = { default: "text-gray-900", alert: "text-red-700", warn: "text-amber-700", good: "text-brand-700" }[tone];
  const body = (
    <Card className={cn("h-full p-4", href && "transition-colors hover:border-brand-300")}>
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold tracking-tight", color)} data-testid={testId}>
        {value}
        {unit && <span className="ml-0.5 text-sm font-semibold text-gray-500">{unit}</span>}
      </p>
      {sub && <p className="mt-0.5 truncate text-xs text-gray-500">{sub}</p>}
    </Card>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}
