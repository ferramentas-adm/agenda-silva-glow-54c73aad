import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

/**
 * Modo de privacidade — exclusivo da função Apresentador.
 * Borra números e nomes próprios (2+ palavras capitalizadas) em todas as telas,
 * inclusive janelas/modais. Não altera os nós de texto do React: apenas marca o
 * elemento pai com `data-privacy-blur`, removido ao desligar.
 */
const STORAGE_KEY = "privacy-mode";
const ATTR = "data-privacy-blur";
const NUM_RE = /\d/;
const NAME_RE = /\p{Lu}[\p{L}'.-]+(?:\s+(?:d[aeo]s?\s+)?\p{Lu}[\p{L}'.-]+)+/u;

function scan(root: Node) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const t = n.nodeValue;
    if (!t || !t.trim()) continue;
    const el = n.parentElement;
    if (!el || el.closest("[data-privacy-ignore],script,style")) continue;
    if (NUM_RE.test(t) || NAME_RE.test(t)) el.setAttribute(ATTR, "");
  }
}

function clearAll() {
  document.querySelectorAll(`[${ATTR}]`).forEach((e) => e.removeAttribute(ATTR));
}

export default function PrivacyModeToggle({ className }: { className?: string }) {
  const { role } = useAuth();
  const isApresentador = role === "apresentador";
  const [on, setOn] = useState(() => localStorage.getItem(STORAGE_KEY) === "1");

  useEffect(() => {
    const active = isApresentador && on;
    if (!active) {
      clearAll();
      return;
    }
    scan(document.body);
    let raf = 0;
    const obs = new MutationObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => scan(document.body));
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => {
      obs.disconnect();
      cancelAnimationFrame(raf);
      clearAll();
    };
  }, [isApresentador, on]);

  if (!isApresentador) return null;

  const toggle = () => {
    const v = !on;
    setOn(v);
    localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
  };

  return (
    <button
      type="button"
      data-privacy-ignore
      onClick={toggle}
      aria-pressed={on}
      title="Borra nomes e números em todas as telas"
      className={cn(
        "flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors",
        on ? "bg-primary/15 text-primary border-primary/40" : "text-muted-foreground border-border hover:text-foreground",
        className,
      )}
    >
      {on ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      Modo de privacidade: {on ? "ligado" : "desligado"}
    </button>
  );
}
