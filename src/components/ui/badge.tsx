import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/constants";

const tones: Record<Tone, string> = {
  gray: "bg-gray-100 text-gray-700 ring-gray-200",
  green: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  blue: "bg-sky-50 text-sky-800 ring-sky-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  purple: "bg-violet-50 text-violet-800 ring-violet-200",
};

export function Badge({
  tone = "gray",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge<K extends string>({
  map,
  value,
}: {
  map: Record<K, { label: string; tone: Tone }>;
  value: K;
}) {
  const entry = map[value];
  return <Badge tone={entry?.tone ?? "gray"}>{entry?.label ?? value}</Badge>;
}
