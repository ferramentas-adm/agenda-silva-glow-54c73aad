// Mock leads data — will be replaced with real API later
export interface Lead {
  id: string;
  name: string;
  phone: string;
}

export const mockLeads: Lead[] = [
  { id: "1", name: "Carlos Mendes", phone: "(11) 98765-4321" },
  { id: "2", name: "Ana Beatriz Souza", phone: "(21) 99876-5432" },
  { id: "3", name: "Ricardo Oliveira", phone: "(31) 97654-3210" },
  { id: "4", name: "Fernanda Lima", phone: "(41) 96543-2109" },
  { id: "5", name: "Paulo Henrique Costa", phone: "(51) 95432-1098" },
  { id: "6", name: "Juliana Martins", phone: "(61) 94321-0987" },
  { id: "7", name: "Marcos Antônio Pereira", phone: "(71) 93210-9876" },
  { id: "8", name: "Camila Rodrigues", phone: "(81) 92109-8765" },
  { id: "9", name: "Thiago Ferreira", phone: "(91) 91098-7654" },
  { id: "10", name: "Larissa Almeida", phone: "(85) 90987-6543" },
];

export function searchLeads(query: string): Lead[] {
  if (!query || query.length < 2) return [];
  const q = query.toLowerCase();
  return mockLeads.filter(
    (l) => l.name.toLowerCase().includes(q) || l.phone.includes(q)
  );
}
