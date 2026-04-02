import { useState, useEffect } from "react";
import { X, FileText, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface BriefingDrawerProps {
  open: boolean;
  briefing: string | null;
  leadName: string;
  closerName: string;
  date: string;
  time: string;
  onClose: () => void;
  onSave: (text: string) => Promise<void>;
  onRemove: () => Promise<void>;
  saving: boolean;
}

export default function BriefingDrawer({
  open,
  briefing,
  leadName,
  closerName,
  date,
  time,
  onClose,
  onSave,
  onRemove,
  saving,
}: BriefingDrawerProps) {
  const [visible, setVisible] = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(briefing || "");

  // Animate in/out
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [open]);

  useEffect(() => {
    setText(briefing || "");
    setEditing(false);
  }, [briefing, open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleSave = async () => {
    await onSave(text);
    setEditing(false);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm transition-opacity duration-300",
          visible ? "opacity-100" : "opacity-0"
        )}
        onClick={onClose}
      />

      {/* Full-screen overlay panel */}
      <div
        className={cn(
          "fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-8 transition-all duration-300 ease-out pointer-events-none",
          visible ? "opacity-100 scale-100" : "opacity-0 scale-95"
        )}
      >
        <div
          className="pointer-events-auto flex flex-col bg-background border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden"
          style={{ boxShadow: "0 25px 60px rgba(0,0,0,0.4)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-6 py-4 shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-base font-semibold">Briefing</h2>
                <p className="text-xs text-muted-foreground">{leadName}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {briefing && !editing && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    onClick={() => setEditing(true)}
                    title="Editar briefing"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    disabled={saving}
                    onClick={onRemove}
                    title="Remover briefing"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Meeting info bar */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-secondary/30 px-6 py-2.5 text-xs text-muted-foreground shrink-0">
            <span><strong className="text-foreground">Closer:</strong> {closerName}</span>
            <span><strong className="text-foreground">Data:</strong> {date}</span>
            <span><strong className="text-foreground">Horário:</strong> {time}</span>
          </div>

          {/* Content — scrollable */}
          <div className="flex-1 overflow-y-auto p-6">
            {editing ? (
              <div className="space-y-4 animate-fade-in">
                <label className="text-sm font-medium text-muted-foreground">
                  {briefing ? "Editar Briefing" : "Novo Briefing"}
                </label>
                <Textarea
                  placeholder="Escreva as anotações do briefing aqui..."
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  className="resize-y text-sm min-h-[250px]"
                  rows={12}
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1"
                    disabled={saving || !text.trim()}
                    onClick={handleSave}
                  >
                    {saving ? "Salvando..." : "Salvar"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditing(false);
                      setText(briefing || "");
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : briefing ? (
              <div className="animate-fade-in">
                <div className="rounded-lg border border-border bg-card p-6 sm:p-8 shadow-sm">
                  <div className="mb-5 border-b border-border pb-4">
                    <h3 className="text-lg font-semibold text-foreground">
                      Briefing — {leadName}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Reunião com {closerName} · {date} às {time}
                    </p>
                  </div>
                  <div className="text-sm leading-7 text-foreground/90 whitespace-pre-wrap break-words overflow-wrap-anywhere">
                    {briefing}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full min-h-[300px] gap-4 text-center animate-fade-in">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
                  <FileText className="h-8 w-8 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">Nenhum briefing adicionado</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Adicione anotações sobre o lead e a reunião.
                  </p>
                </div>
                <Button size="sm" onClick={() => setEditing(true)}>
                  Adicionar Briefing
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
