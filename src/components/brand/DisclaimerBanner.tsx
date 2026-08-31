/**
 * Aviso institucional exibido no topo de todas as telas.
 * Estilo "vidro" vermelho (glassmorphism), responsivo e com
 * formatação preservada (texto justificado, hífens seguros).
 */
export function DisclaimerBanner() {
  return (
    <div className="w-full px-3 pt-[calc(0.25rem+env(safe-area-inset-top))]">
      <p
        role="note"
        className="mx-auto w-full max-w-md rounded-md bg-[#e8192c]/85 px-2.5 py-1 text-center text-[9px] leading-snug text-white/90 sm:text-[10px]"
      >
        Este não é um aplicativo oficial da Aegea. Trata-se de um protótipo
        desenvolvido por um colaborador, de uso facultativo, com o objetivo de
        auxiliar as equipes em campo, apoiar o líder na organização das
        atividades e contribuir para uma atuação mais eficiente e produtiva por
        meio do uso da tecnologia.
      </p>
    </div>
  );
}
