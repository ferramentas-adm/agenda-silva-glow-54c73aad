import { cn } from "@/lib/utils";

interface Props {
  enviada?: boolean | null;
  url?: string | null;
  className?: string;
}

/** Bandeira laranja exibida quando a proposta comercial foi enviada ao lead. */
export function PropostaFlag({ enviada, url, className }: Props) {
  if (!enviada) return null;
  const content = <span aria-hidden>🟠</span>;
  const cls = cn("inline-flex h-4 w-4 items-center justify-center rounded-full bg-background/90 shadow-sm ring-1 ring-orange-500 leading-none text-[10px] cursor-pointer", className);
  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title="Proposta comercial enviada"
        aria-label="Proposta comercial enviada — abrir proposta"
        className={cls}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {content}
      </a>
    );
  }
  return (
    <span title="Proposta comercial enviada" aria-label="Proposta comercial enviada" className={cls}>
      {content}
    </span>
  );
}
