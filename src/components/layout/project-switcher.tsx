"use client";

import { useTransition } from "react";
import { selectProject } from "@/app/(app)/actions";

export function ProjectSwitcher({ projects, current }: { projects: { id: string; name: string }[]; current: string }) {
  const [pending, start] = useTransition();
  if (projects.length === 0) return <span className="text-sm text-gray-500">소속 사업장 없음</span>;
  if (projects.length === 1) {
    return <p className="truncate text-[15px] font-semibold text-gray-900">{projects[0].name}</p>;
  }
  return (
    <select
      aria-label="사업장 선택"
      value={current}
      disabled={pending}
      onChange={(e) => start(() => selectProject(e.target.value))}
      className="h-10 max-w-full truncate rounded-lg border border-gray-300 bg-white pl-3 pr-8 text-[15px] font-semibold text-gray-900 md:text-sm"
    >
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
