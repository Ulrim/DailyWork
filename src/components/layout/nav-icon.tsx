import {
  Bell, Building2, CalendarDays, ClipboardCheck, ClipboardList, FileBarChart, FileStack, GanttChartSquare, History,
  LayoutDashboard, ListChecks, UserCog, Users,
} from "lucide-react";
import type { NavItem } from "@/lib/nav";

const ICONS = {
  dashboard: LayoutDashboard,
  report: ClipboardList,
  review: ClipboardCheck,
  task: ListChecks,
  calendar: CalendarDays,
  progress: GanttChartSquare,
  consolidated: FileStack,
  output: FileBarChart,
  bell: Bell,
  history: History,
  users: Users,
  building: Building2,
  user: UserCog,
} as const;

export function NavIcon({ name, className }: { name: NavItem["icon"]; className?: string }) {
  const Icon = ICONS[name];
  return <Icon className={className} aria-hidden />;
}
