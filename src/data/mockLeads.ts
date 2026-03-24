// Lead type — now shared across the app
export interface Lead {
  id: string;
  name: string;
  phone: string;
  dataCrazyId?: string;
  tags?: { id: string; name: string }[];
}

// Legacy mock data kept for backwards compatibility
export const mockLeads: Lead[] = [];

export function searchLeads(_query: string): Lead[] {
  return [];
}
