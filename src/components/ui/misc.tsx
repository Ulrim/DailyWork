import * as React from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3 md:mb-6">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-gray-900 md:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
      </div>
      {action && <div className="no-print flex flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
      <p className="text-sm font-medium text-gray-700">{title}</p>
      {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** 실적(막대)과 계획(세로선)을 함께 보여 주는 진행 막대 */
export function ProgressBar({
  value,
  planned,
  tone = "brand",
  className,
}: {
  value: number;
  planned?: number | null;
  tone?: "brand" | "red" | "gray";
  className?: string;
}) {
  const clamp = (n: number) => Math.min(100, Math.max(0, n));
  const fill = { brand: "bg-brand-600", red: "bg-red-500", gray: "bg-gray-400" }[tone];
  return (
    <div
      className={cn("relative h-2 w-full rounded-full bg-gray-200", className)}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={cn("h-full rounded-full", fill)} style={{ width: `${clamp(value)}%` }} />
      {planned != null && (
        <div
          className="absolute -top-0.5 h-3 w-0.5 rounded bg-gray-900"
          style={{ left: `calc(${clamp(planned)}% - 1px)` }}
          title={`계획 ${planned}%`}
        />
      )}
    </div>
  );
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null) return "-";
  return `${Number(Number(value).toFixed(1))}%`;
}

export function DefinitionList({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-2 text-sm">
      {items.map((item) => (
        <React.Fragment key={item.label}>
          <dt className="text-gray-500">{item.label}</dt>
          <dd className="min-w-0 whitespace-pre-wrap break-words text-gray-900">{item.value}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}
