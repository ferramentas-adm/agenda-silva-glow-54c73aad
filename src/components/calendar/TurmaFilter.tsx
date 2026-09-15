import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TurmaFilterValue } from "@/hooks/useCloserFilter";

export function TurmaFilter({
  value,
  onChange,
  countA,
  countB,
  className,
}: {
  value: TurmaFilterValue;
  onChange: (v: TurmaFilterValue) => void;
  countA: number;
  countB: number;
  className?: string;
}) {
  const options: { key: TurmaFilterValue; label: string }[] = [
    { key: "todos", label: "Todos" },
    { key: "a", label: `Turma A (${countA})` },
    { key: "b", label: `Turma B (${countB})` },
  ];

  return (
    <div className={cn("flex items-center gap-2 flex-wrap", className)}>
      <span className="text-xs text-muted-foreground font-medium">Turma:</span>
      {options.map((opt) => (
        <Button
          key={opt.key}
          variant={value === opt.key ? "default" : "outline"}
          size="sm"
          className="h-7 text-xs"
          onClick={() => onChange(opt.key)}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
}
