export type LeadQualificationFilter = "all" | "qualified" | "disqualified";

export const LEAD_QUALIFICATION_OPTIONS: { value: LeadQualificationFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "qualified", label: "Qualificados" },
  { value: "disqualified", label: "Desqualificados" },
];

export function matchesLeadQualification(
  leadDesqualificado: boolean | null | undefined,
  filter: LeadQualificationFilter,
): boolean {
  if (filter === "all") return true;
  return filter === "disqualified" ? leadDesqualificado === true : leadDesqualificado !== true;
}