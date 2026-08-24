import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useAppSettingList, APP_SETTING_KEYS } from "@/hooks/useAppSettingList";
import {
  DEFAULT_ORDER_BUMPS,
  OrderBump,
  formatOrderBumpLabel,
  parseOrderBump,
} from "@/lib/orderBumps";

interface OrderBumpsFieldProps {
  value: OrderBump[];
  onChange: (bumps: OrderBump[]) => void;
  idPrefix?: string;
}

/**
 * Bloco de seleção múltipla de order bumps. O valor de cada bump é apenas
 * informativo — nada é somado ao valor coletado da venda.
 */
export default function OrderBumpsField({ value, onChange, idPrefix = "ob" }: OrderBumpsFieldProps) {
  const { items } = useAppSettingList(APP_SETTING_KEYS.order_bumps, DEFAULT_ORDER_BUMPS);
  const options = items.map(parseOrderBump).filter((b) => !!b.nome);

  if (options.length === 0) return null;

  const isChecked = (nome: string) => value.some((b) => b.nome === nome);

  const toggle = (bump: OrderBump, checked: boolean) => {
    if (checked) {
      if (isChecked(bump.nome)) return;
      onChange([...value, bump]);
    } else {
      onChange(value.filter((b) => b.nome !== bump.nome));
    }
  };

  return (
    <div className="space-y-2">
      <Label>Order bumps (opcional)</Label>
      <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
        {options.map((bump) => {
          const id = `${idPrefix}-${bump.nome.replace(/\s+/g, "-").toLowerCase()}`;
          return (
            <div key={bump.nome} className="flex items-center gap-2">
              <Checkbox
                id={id}
                checked={isChecked(bump.nome)}
                onCheckedChange={(c) => toggle(bump, c === true)}
              />
              <Label htmlFor={id} className="cursor-pointer font-normal">
                {formatOrderBumpLabel(bump)}
              </Label>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Marque os itens adicionais incluídos nesta venda. O valor do bump já está dentro do valor
        total — nada é somado automaticamente.
      </p>
    </div>
  );
}
