import { cn } from "@/lib/utils";

/** Indicador visual do funil Parceria comercial. */
export function ParceriaFlag({ show, className }: { show: boolean; className?: string }) {
  if (!show) return null;

  return (
    <span
      role="img"
      aria-label="Parceria comercial"
      title="Parceria comercial"
      className={cn("inline-block h-3 w-3 shrink-0 rounded-full bg-parceria", className)}
    />
  );
}