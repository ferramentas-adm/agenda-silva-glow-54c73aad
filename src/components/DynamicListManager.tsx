import { useState } from "react";
import { useAppSettingList } from "@/hooks/useAppSettingList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Pencil, Trash2, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface DynamicListManagerProps {
  settingKey: string;
  title: string;
  description?: string;
  defaults?: string[];
}

export default function DynamicListManager({ settingKey, title, description, defaults = [] }: DynamicListManagerProps) {
  const { items, isLoading, add, remove, update, isSaving } = useAppSettingList(settingKey, defaults);
  const [newItem, setNewItem] = useState("");
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const handleAdd = () => {
    if (!newItem.trim()) {
      toast.error("Digite um valor");
      return;
    }
    add(newItem);
    setNewItem("");
  };

  const handleStartEdit = (item: string) => {
    setEditingItem(item);
    setEditValue(item);
  };

  const handleSaveEdit = () => {
    if (!editingItem || !editValue.trim()) return;
    update(editingItem, editValue);
    setEditingItem(null);
    setEditValue("");
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
          placeholder="Adicionar novo item..."
          className="h-9"
          disabled={isSaving}
        />
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
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleSaveEdit} disabled={isSaving}>
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingItem(null)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </>
              ) : deleteTarget === item ? (
                <>
                  <span className="flex-1 text-sm text-destructive">Confirmar exclusão de "{item}"?</span>
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
                  <span className="flex-1 text-sm">{item}</span>
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
