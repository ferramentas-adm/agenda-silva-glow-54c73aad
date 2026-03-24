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
            {closer.name}
          </button>
        );
      })}
    </div>
  );
}
