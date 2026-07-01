import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SdrTeam } from "./SdrTeamBadge";

export type SdrTeamFilterValue = "all" | SdrTeam;

const OPTIONS: { key: SdrTeamFilterValue; label: string; activeClass: string }[] = [
  { key: "all", label: "Todos", activeClass: "" },
  { key: "trafego", label: "Tráfego", activeClass: "bg-sky-500 hover:bg-sky-500/90 text-white border-sky-500" },
  {
    key: "social_selling",
    label: "Social Selling",
    activeClass: "bg-violet-500 hover:bg-violet-500/90 text-white border-violet-500",
  },
];

export function SdrTeamFilter({
  value,
  onChange,
  className,
}: {
  value: SdrTeamFilterValue;
  onChange: (v: SdrTeamFilterValue) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2 flex-wrap", className)}>
      <span className="text-xs text-muted-foreground font-medium">Time:</span>
      {OPTIONS.map((opt) => {
        const active = value === opt.key;
        return (
          <Button
            key={opt.key}
            variant={active ? "default" : "outline"}
            size="sm"
            className={cn("h-7 text-xs", active && opt.activeClass)}
            onClick={() => onChange(opt.key)}
          >
            {opt.label}
          </Button>
        );
      })}
    </div>
  );
}
