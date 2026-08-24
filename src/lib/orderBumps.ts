/**
 * Order bumps da venda.
 *
 * Configuráveis em Administração > +Listas (`app_settings` chave `order_bumps`),
 * armazenados como strings no formato `Nome|valor` (valor em reais).
 * O valor do bump NÃO é somado ao valor coletado — serve apenas como registro
 * de quais itens adicionais fizeram parte da venda.
 */

export interface OrderBump {
  nome: string;
  valor: number;
}

export const DEFAULT_ORDER_BUMPS = [
  "Extensão de acesso 6 meses|3000",
  "Grupo VIP|2000",
];

/** Converte item da lista (`"Grupo VIP|2000"`) em `{ nome, valor }`. */
export function parseOrderBump(raw: string): OrderBump {
  const [nomePart, valorPart] = raw.split("|");
  const nome = (nomePart ?? "").trim();
  const valor = Number(String(valorPart ?? "").replace(",", ".").trim());
  return { nome, valor: Number.isFinite(valor) ? valor : 0 };
}

/** Formato de armazenamento na lista dinâmica. */
export function formatOrderBump(bump: OrderBump): string {
  return `${bump.nome.trim()}|${bump.valor}`;
}

export function formatOrderBumpValor(valor: number): string {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

/** Rótulo exibido ao usuário: `"Grupo VIP — R$ 2.000,00"`. */
export function formatOrderBumpLabel(bump: OrderBump): string {
  return bump.valor > 0 ? `${bump.nome} — ${formatOrderBumpValor(bump.valor)}` : bump.nome;
}

/** Normaliza o valor lido de `vendas.order_bumps` (jsonb). */
export function parseOrderBumpsColumn(value: unknown): OrderBump[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => {
      if (typeof v === "string") return parseOrderBump(v);
      const obj = v as { nome?: unknown; valor?: unknown };
      const nome = typeof obj?.nome === "string" ? obj.nome : "";
      const valor = Number(obj?.valor);
      return { nome, valor: Number.isFinite(valor) ? valor : 0 };
    })
    .filter((b) => !!b.nome);
}

export const orderBumpsTotal = (bumps: OrderBump[]) =>
  bumps.reduce((sum, b) => sum + (Number(b.valor) || 0), 0);
