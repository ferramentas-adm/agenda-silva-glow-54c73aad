import { useState } from "react";
import { useAppSettingList, APP_SETTING_KEYS } from "@/hooks/useAppSettingList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Pencil, Trash2, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatOrderBump, formatOrderBumpLabel, parseOrderBump } from "@/lib/orderBumps";

interface DynamicListManagerProps {
  settingKey: string;
  title: string;
  description?: string;
  defaults?: string[];
}

export default function DynamicListManager({ settingKey, title, description, defaults = [] }: DynamicListManagerProps) {
  const { items, isLoading, add, remove, update, isSaving } = useAppSettingList(settingKey, defaults);
  const [newItem, setNewItem] = useState("");
  const [newValor, setNewValor] = useState("");
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editValor, setEditValor] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  /** Lista de itens com nome + valor (order bumps). */
  const isPricedList = settingKey === APP_SETTING_KEYS.order_bumps;

  const labelFor = (item: string) =>
    isPricedList ? formatOrderBumpLabel(parseOrderBump(item)) : item;

  const handleAdd = () => {
    if (!newItem.trim()) {
      toast.error("Digite um valor");
      return;
    }
    if (isPricedList) {
      const valor = Number(newValor.replace(/\./g, "").replace(",", "."));
      if (!Number.isFinite(valor) || valor <= 0) {
        toast.error("Informe o valor do order bump");
        return;
      }
      add(formatOrderBump({ nome: newItem.trim(), valor }));
      setNewItem("");
      setNewValor("");
      return;
    }
    add(newItem);
    setNewItem("");
  };

  const handleStartEdit = (item: string) => {
    setEditingItem(item);
    if (isPricedList) {
      const parsed = parseOrderBump(item);
      setEditValue(parsed.nome);
      setEditValor(String(parsed.valor).replace(".", ","));
    } else {
      setEditValue(item);
    }
  };

  const handleSaveEdit = () => {
    if (!editingItem || !editValue.trim()) return;
    if (isPricedList) {
      const valor = Number(editValor.replace(/\./g, "").replace(",", "."));
      if (!Number.isFinite(valor) || valor <= 0) {
        toast.error("Informe o valor do order bump");
        return;
      }
      update(editingItem, formatOrderBump({ nome: editValue.trim(), valor }));
    } else {
      update(editingItem, editValue);
    }
    setEditingItem(null);
    setEditValue("");
    setEditValor("");
  };

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div>
        <h3 className="font-semibold text-sm">{title}</h3>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>

      <div className="flex gap-2">
        <Input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder={isPricedList ? "Nome do order bump..." : "Adicionar novo item..."}
          className="h-9"
          disabled={isSaving}
        />
        {isPricedList && (
          <Input
            value={newValor}
            onChange={(e) => setNewValor(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="Valor (R$)"
            inputMode="decimal"
            className="h-9 w-32"
            disabled={isSaving}
          />
        )}
        <Button onClick={handleAdd} size="sm" disabled={isSaving || !newItem.trim()}>
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        </Button>
      </div>

      <div className="space-y-1.5 max-h-60 overflow-y-auto">
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Carregando...</p>
        ) : items.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">Nenhum item cadastrado.</p>
        ) : (
          items.map((item) => (
            <div key={item} className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5">
              {editingItem === item ? (
                <>
                  <Input
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveEdit();
                      if (e.key === "Escape") setEditingItem(null);
                    }}
                    className="h-7 text-sm"
                    autoFocus
                  />
                  {isPricedList && (
                    <Input
                      value={editValor}
                      onChange={(e) => setEditValor(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveEdit();
                        if (e.key === "Escape") setEditingItem(null);
                      }}
                      placeholder="Valor (R$)"
                      inputMode="decimal"
                      className="h-7 w-28 text-sm"
                    />
                  )}
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleSaveEdit} disabled={isSaving}>
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingItem(null)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </>
              ) : deleteTarget === item ? (
                <>
                  <span className="flex-1 text-sm text-destructive">Confirmar exclusão de "{labelFor(item)}"?</span>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-7"
                    onClick={() => {
                      remove(item);
                      setDeleteTarget(null);
                    }}
                    disabled={isSaving}
                  >
                    Excluir
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7" onClick={() => setDeleteTarget(null)}>
                    Cancelar
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm">{labelFor(item)}</span>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleStartEdit(item)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => setDeleteTarget(item)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
