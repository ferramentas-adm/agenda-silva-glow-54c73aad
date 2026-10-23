import { cn } from "@/lib/utils";

/** Indicador visual de "Perfil que compra". Só visual: não altera funil, filtros nem APIs. */
export function PerfilQueCompraFlag({ show, className }: { show: boolean; className?: string }) {
  if (!show) return null;

  return (
    <span
      role="img"
      aria-label="Perfil que compra"
      title="Perfil que compra"
      className={cn("inline-block h-3 w-3 shrink-0 rounded-full bg-perfil-compra", className)}
    />
  );
}
