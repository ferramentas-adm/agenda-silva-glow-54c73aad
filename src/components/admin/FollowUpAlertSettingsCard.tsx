import { useEffect, useState } from "react";
import { BellRing, Loader2, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useFollowUpAlertOffsets } from "@/hooks/useFollowUpAlertOffsets";
import { MIN_ALERTS_PER_DAY } from "@/lib/followUp";

/** Configura quantos avisos por dia e a antecedência de cada um. */
export default function FollowUpAlertSettingsCard() {
  const { offsets, isLoading, save } = useFollowUpAlertOffsets();
  const [values, setValues] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValues(offsets.map((o) => String(o)));
  }, [offsets.join(",")]);

  const handleSave = async () => {
    const nums = values.map((v) => Number(v)).filter((n) => Number.isFinite(n) && n >= 0);
    if (nums.length < MIN_ALERTS_PER_DAY) {
      toast.error(`Configure no mínimo ${MIN_ALERTS_PER_DAY} avisos por dia.`);
      return;
    }
    setSaving(true);
    await save(nums);
    setSaving(false);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <BellRing className="h-4 w-4 text-primary" />
          Avisos de follow-up na tela
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Quantos minutos antes do horário combinado o closer recebe o aviso com som. No mínimo{" "}
          {MIN_ALERTS_PER_DAY} avisos por compromisso — o padrão é 60, 30 e 10 minutos antes.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <>
            <div className="space-y-2">
              {values.map((v, idx) => (
                <div key={idx} className="flex items-end gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Aviso {idx + 1}</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        max={1440}
                        value={v}
                        onChange={(e) =>
                          setValues((prev) => prev.map((p, i) => (i === idx ? e.target.value : p)))
                        }
                        className="h-9 w-24"
                      />
                      <span className="text-xs text-muted-foreground">minutos antes</span>
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9 text-destructive"
                    disabled={values.length <= MIN_ALERTS_PER_DAY}
                    onClick={() => setValues((prev) => prev.filter((_, i) => i !== idx))}
                    title={
                      values.length <= MIN_ALERTS_PER_DAY
                        ? `São necessários ao menos ${MIN_ALERTS_PER_DAY} avisos`
                        : "Remover"
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setValues((p) => [...p, "5"])}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Adicionar aviso
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
