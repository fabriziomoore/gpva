/**
 * Aviso institucional exibido no topo de todas as telas.
 * Estilo "vidro" vermelho (glassmorphism), responsivo e com
 * formatação preservada (texto justificado, hífens seguros).
 */
export function DisclaimerBanner() {
  return (
    <div className="w-full px-3 pt-[calc(0.5rem+env(safe-area-inset-top))]">
      <p
        role="note"
        className="mx-auto w-full max-w-2xl rounded-xl bg-red-500/30 px-4 py-2.5 text-center text-[11px] leading-relaxed text-foreground shadow-lg backdrop-blur-md sm:text-xs"
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
