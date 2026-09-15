import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FunilFilterValue } from "@/lib/funilDiretor";

export function FunilFilter({
  value,
  onChange,
  className,
}: {
  value: FunilFilterValue;
  onChange: (v: FunilFilterValue) => void;
  className?: string;
}) {
  const options: { key: FunilFilterValue; label: string }[] = [
    { key: "todos", label: "Todos" },
    { key: "diretor", label: "Diretor" },
    { key: "padrao", label: "Padrão" },
  ];

  return (
    <div className={cn("flex items-center gap-2 flex-wrap", className)}>
      <span className="text-xs text-muted-foreground font-medium">Funil:</span>
      {options.map((opt) => (
        <Button
          key={opt.key}
          variant={value === opt.key ? "default" : "outline"}
          size="sm"
          className={cn(
            "h-7 text-xs",
            opt.key === "diretor" && value === "diretor" && "bg-red-600 hover:bg-red-600/90 text-white"
          )}
          onClick={() => onChange(opt.key)}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
}
