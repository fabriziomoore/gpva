// Cards do topo da tela de Expediente que podem ser ocultados por setor
// (Admin → Setores → "Cards do expediente"). A chave é o que fica gravado
// em setores.kpis_ocultos. Negociado e Variável / dia não estão aqui: seguem
// os interruptores "Aba de negociações" e "Sistema de variável" do setor.
export const SHIFT_KPIS = [
  { key: "total", label: "Total" },
  { key: "viaveis", label: "Viáveis" },
  { key: "inviaveis", label: "Inviáveis" },
  { key: "efetividade", label: "Efetividade" },
  { key: "tempo_os", label: "Tempo M. O.S" },
] as const;

export type ShiftKpiKey = (typeof SHIFT_KPIS)[number]["key"];
