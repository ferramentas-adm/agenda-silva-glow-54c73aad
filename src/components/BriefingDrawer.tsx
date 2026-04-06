import { useEffect, useState } from "react";
import { X, FileText, Pencil, Trash2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

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
  briefingReadAt?: string | null;
  briefingReadByName?: string | null;
  onMarkRead?: () => Promise<void>;
  showReadButton?: boolean;
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
  briefingReadAt,
  briefingReadByName,
  onMarkRead,
  showReadButton = false,
}: BriefingDrawerProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(briefing || "");
  const [markingRead, setMarkingRead] = useState(false);

  useEffect(() => {
    setText(briefing || "");
    setEditing(false);
  }, [briefing, open]);

  const handleSave = async () => {
    await onSave(text);
    setEditing(false);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setEditing(false);
          setText(briefing || "");
          onClose();
        }
      }}
    >
      <SheetContent
        side="right"
        className="w-full max-w-xl p-0 sm:max-w-xl [&>button]:hidden"
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Briefing</SheetTitle>
          <SheetDescription>Briefing do lead {leadName}</SheetDescription>
        </SheetHeader>

        <div className="flex h-full flex-col">
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
                title="Fechar briefing"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-secondary/30 px-6 py-2.5 text-xs text-muted-foreground shrink-0">
            <span><strong className="text-foreground">Closer:</strong> {closerName}</span>
            <span><strong className="text-foreground">Data:</strong> {date}</span>
            <span><strong className="text-foreground">Horário:</strong> {time}</span>
          </div>

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
                  className="resize-y text-sm min-h-[300px]"
                  rows={14}
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
              <div className="animate-fade-in space-y-4">
                <div className="rounded-lg border border-border bg-card p-6 sm:p-8 shadow-sm">
                  <div className="mb-5 border-b border-border pb-4">
                    <h3 className="text-lg font-semibold text-foreground">
                      Briefing — {leadName}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Reunião com {closerName} · {date} às {time}
                    </p>
                  </div>
                  <div
                    className="text-sm leading-7 text-foreground/90 whitespace-pre-wrap break-words"
                    style={{ overflowWrap: "anywhere" }}
                  >
                    {briefing}
                  </div>
                </div>

                {/* Read confirmation */}
                {briefingReadAt ? (
                  <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-700 dark:text-green-400">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span>
                      Lido por <strong>{briefingReadByName || "—"}</strong> em{" "}
                      {format(new Date(briefingReadAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                ) : showReadButton && onMarkRead ? (
                  <Button
                    className="w-full gap-2"
                    variant="outline"
                    disabled={markingRead}
                    onClick={async () => {
                      setMarkingRead(true);
                      await onMarkRead();
                      setMarkingRead(false);
                    }}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {markingRead ? "Marcando..." : "Marcar como lido"}
                  </Button>
                ) : null}
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
      </SheetContent>
    </Sheet>
  );
}
