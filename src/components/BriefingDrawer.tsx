import { useEffect, useState } from "react";
import { X, FileText, Pencil, Trash2, CheckCircle2, MessageSquarePlus, Send } from "lucide-react";
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
import { linkifyText } from "@/lib/linkify";
import type { BriefingComment } from "@/hooks/useBriefingComments";

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
  /** Quando false, o briefing original é somente leitura (ex.: SDR em reunião de outro SDR). */
  canEditOriginal?: boolean;
  /** Comentários adicionais da reunião (briefings de outros SDRs). */
  comments?: BriefingComment[];
  authorNameById?: Map<string, string>;
  currentUserId?: string | null;
  canManageAllComments?: boolean;
  canAddComment?: boolean;
  onAddComment?: (text: string) => Promise<void>;
  onEditComment?: (id: string, text: string) => Promise<void>;
  onRemoveComment?: (id: string) => Promise<void>;
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
  canEditOriginal = true,
  comments = [],
  authorNameById,
  currentUserId,
  canManageAllComments = false,
  canAddComment = false,
  onAddComment,
  onEditComment,
  onRemoveComment,
}: BriefingDrawerProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(briefing || "");
  const [markingRead, setMarkingRead] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [commentFormOpen, setCommentFormOpen] = useState(false);
  const [busyComment, setBusyComment] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState("");

  useEffect(() => {
    setText(briefing || "");
    setEditing(false);
    setNewComment("");
    setCommentFormOpen(false);
    setEditingCommentId(null);
  }, [briefing, open]);

  const handleSave = async () => {
    await onSave(text);
    setEditing(false);
  };

  const authorName = (id: string) =>
    authorNameById?.get(id) || (id === currentUserId ? "Você" : "—");

  const renderComments = () => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">
          Comentários da equipe{comments.length > 0 ? ` (${comments.length})` : ""}
        </p>
        {canAddComment && onAddComment && !commentFormOpen && (
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setCommentFormOpen(true)}>
            <MessageSquarePlus className="h-3.5 w-3.5" />Adicionar comentário
          </Button>
        )}
      </div>

      {commentFormOpen && onAddComment && (
        <div className="space-y-2 rounded-lg border border-border bg-card p-3">
          <Textarea
            placeholder="Escreva o seu comentário sobre o lead ou a reunião..."
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            className="resize-y text-sm min-h-[110px]"
            autoFocus
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              className="gap-1.5"
              disabled={!newComment.trim() || busyComment === "new"}
              onClick={async () => {
                setBusyComment("new");
                try {
                  await onAddComment(newComment);
                  setNewComment("");
                  setCommentFormOpen(false);
                } finally {
                  setBusyComment(null);
                }
              }}
            >
              <Send className="h-3.5 w-3.5" />
              {busyComment === "new" ? "Enviando..." : "Enviar"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setCommentFormOpen(false); setNewComment(""); }}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {comments.length === 0 && !commentFormOpen && (
        <p className="text-xs text-muted-foreground">Nenhum comentário adicionado ainda.</p>
      )}

      {comments.map((c) => {
        const mine = c.author_id === currentUserId;
        const canEdit = mine && !!onEditComment;
        const canDelete = (mine || canManageAllComments) && !!onRemoveComment;
        const isEditing = editingCommentId === c.id;
        return (
          <div key={c.id} className="rounded-lg border border-border bg-card p-4">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-foreground">{authorName(c.author_id)}</p>
                <p className="text-[11px] text-muted-foreground">
                  {format(new Date(c.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  {c.updated_at !== c.created_at && " · editado"}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {canEdit && !isEditing && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    title="Editar meu comentário"
                    onClick={() => { setEditingCommentId(c.id); setEditingCommentText(c.content); }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                )}
                {canDelete && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    title="Remover comentário"
                    disabled={busyComment === c.id}
                    onClick={async () => {
                      setBusyComment(c.id);
                      try {
                        await onRemoveComment!(c.id);
                      } finally {
                        setBusyComment(null);
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>

            {isEditing ? (
              <div className="space-y-2">
                <Textarea
                  value={editingCommentText}
                  onChange={(e) => setEditingCommentText(e.target.value)}
                  className="resize-y text-sm min-h-[100px]"
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={!editingCommentText.trim() || busyComment === c.id}
                    onClick={async () => {
                      setBusyComment(c.id);
                      try {
                        await onEditComment!(c.id, editingCommentText);
                        setEditingCommentId(null);
                      } finally {
                        setBusyComment(null);
                      }
                    }}
                  >
                    Salvar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingCommentId(null)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <div
                className="text-sm leading-6 text-foreground/90 whitespace-pre-wrap break-words"
                style={{ overflowWrap: "anywhere" }}
              >
                {linkifyText(c.content)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

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
              {briefing && !editing && canEditOriginal && (
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
            ) : (
              <div className="animate-fade-in space-y-6">
                {briefing ? (
                  <>
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
                        {linkifyText(briefing)}
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
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border py-10 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
                      <FileText className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Nenhum briefing adicionado</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {canEditOriginal
                          ? "Adicione anotações sobre o lead e a reunião."
                          : "Você pode acrescentar um comentário abaixo."}
                      </p>
                    </div>
                    {canEditOriginal && (
                      <Button size="sm" onClick={() => setEditing(true)}>
                        Adicionar Briefing
                      </Button>
                    )}
                  </div>
                )}

                {renderComments()}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
