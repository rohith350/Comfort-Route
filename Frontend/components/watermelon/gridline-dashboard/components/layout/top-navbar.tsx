import { MoonStar, SunDim } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { modelWorkflowStatuses } from "../../data";
import { ProfileMenu } from "../shared/profile-menu";
import { MobileNavigation } from "./app-sidebar";

type TopbarProps = {
  isDark: boolean;
  onThemeChange: (isDark: boolean) => void;
};

function StatusStrip() {
  return (
    <div className="hidden h-6.5 shrink-0 items-center overflow-hidden rounded-md bg-muted font-mono text-xs tracking-tight sm:flex">
      <span className="flex h-full items-center gap-2 border-r-2 border-sidebar px-2.5 text-primary">
        <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
        {modelWorkflowStatuses.publication}
      </span>
      <span className="flex h-full items-center border-r-2 border-sidebar px-2.5 text-emerald-400">
        {modelWorkflowStatuses.validation}
      </span>
    </div>
  );
}

function DesktopThemeToggle({
  isDark,
  onThemeChange,
}: {
  isDark: boolean;
  onThemeChange: (isDark: boolean) => void;
}) {
  const ThemeIcon = isDark ? MoonStar : SunDim;

  return (
    <div className="hidden items-center gap-3 md:flex">
      <div className="flex items-center gap-1 font-mono text-xs">
        <ThemeIcon
          aria-hidden="true"
          className={isDark ? "size-4" : "size-4.5"}
          strokeWidth={1.5}
        />
        <span>{isDark ? "Dark Mode" : "Light Mode"}</span>
      </div>
      <Switch
        checked={isDark}
        onCheckedChange={onThemeChange}
        aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
        className="data-unchecked:bg-muted"
      />
    </div>
  );
}

export function TopNavbar({ isDark, onThemeChange }: TopbarProps) {
  return (
    <header className="absolute left-0 right-0 top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-sidebar-border bg-sidebar px-3 text-sidebar-foreground sm:px-5 md:left-17 md:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <MobileNavigation isDark={isDark} onThemeChange={onThemeChange} />
        <span className="truncate text-sm font-semibold tracking-wide">
          Delhi Transit Crowd Planner
        </span>
        <StatusStrip />
      </div>

      <div className="flex min-w-0 items-center gap-4 font-mono text-xs text-muted-foreground lg:gap-6">
        <DesktopThemeToggle isDark={isDark} onThemeChange={onThemeChange} />
        <ProfileMenu placement="topbar" className="md:hidden" />
      </div>
    </header>
  );
}
