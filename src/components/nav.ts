import {
  LayoutDashboard,
  Sparkles,
  History,
  Wrench,
  Database,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

export type TabId = "dashboard" | "predictions" | "analytics" | "tuning" | "data";

export interface TabDef {
  id: TabId;
  label: string;
  icon: LucideIcon;
}

export const TABS: TabDef[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "predictions", label: "Predictions", icon: Sparkles },
  { id: "analytics", label: "Win-Rate Analytics", icon: TrendingUp },
  { id: "tuning", label: "Auto-Tuning", icon: Wrench },
  { id: "data", label: "Draws & Data", icon: Database },
];
