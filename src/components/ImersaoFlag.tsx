import { Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import { IMERSAO_LABEL } from "@/lib/funilDiretor";

/** Bandeira azul do funil "Imersão de 2 dias". Só visual. */
export function ImersaoFlag({ show, compact, className }: { show: boolean; compact?: boolean; className?: string }) {
  if (!show) return null;
  return (
    <span
      title="Funil Imersão de 2 dias"
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-imersao/40 bg-imersao/10 px-1.5 py-0.5 font-semibold leading-none text-imersao",
        compact ? "text-[8px]" : "text-[10px]",
        className,
      )}
    >
      <Flag className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} fill="currentColor" />
      {!compact && IMERSAO_LABEL}
    </span>
  );
}
