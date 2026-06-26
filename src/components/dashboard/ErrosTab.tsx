import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ErrosSDRTab from "./ErrosSDRTab";
import ErrosCloserTab from "./ErrosCloserTab";

interface Props {
  currentDate: Date;
  dateRange?: DateRange;
}

export default function ErrosTab({ currentDate, dateRange }: Props) {
  const [sub, setSub] = useState<"sdr" | "closer">("sdr");
  return (
    <div className="space-y-4">
      <Tabs value={sub} onValueChange={(v) => setSub(v as "sdr" | "closer")}>
        <TabsList>
          <TabsTrigger value="sdr">Erros SDR</TabsTrigger>
          <TabsTrigger value="closer">Erros Closer</TabsTrigger>
        </TabsList>
        <TabsContent value="sdr" className="mt-4">
          <ErrosSDRTab currentDate={currentDate} dateRange={dateRange} />
        </TabsContent>
        <TabsContent value="closer" className="mt-4">
          <ErrosCloserTab currentDate={currentDate} dateRange={dateRange} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
