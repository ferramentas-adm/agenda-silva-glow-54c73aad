import { cn } from "@/lib/utils";

interface Closer {
  id: string;
  name: string;
}

interface CloserFilterBarProps {
  closers: Closer[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
}

export default function CloserFilterBar({ closers, selectedIds, onToggle }: CloserFilterBarProps) {
  if (!closers.length) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {closers.map((closer) => {
        const selected = selectedIds.has(closer.id);
        const initial = closer.name.charAt(0).toUpperCase();

        return (
          <button
            key={closer.id}
            onClick={() => onToggle(closer.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors active:scale-[0.97]",
              selected
                ? "bg-primary text-primary-foreground"
                : "bg-[hsl(0_0%_20%)] text-[hsl(0_0%_53%)]"
            )}
          >
            <span
              className={cn(
                "inline-block h-2 w-2 rounded-full",
                selected ? "bg-primary-foreground/60" : "bg-[hsl(0_0%_35%)]"
              )}
            />
            {initial} {closer.name}
          </button>
        );
      })}
    </div>
  );
}
