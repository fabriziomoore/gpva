import { AlertTriangle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Motivos de inviabilidade que exigem abrir desdobro posterior de CADASTRAL.
const DESDOBRO_REASONS = [
  "duplicidade",
  "area de risco",
  "endereco nao localizado",
  "ramal/rede nao localizado",
  "ligacao inexistente",
];

function normalize(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

export function requiresDesdobroCadastral(reasonName: string | null | undefined): boolean {
  return !!reasonName && DESDOBRO_REASONS.includes(normalize(reasonName));
}

/**
 * Lembrete obrigatório depois de registrar um serviço inviável com um dos
 * motivos acima. Só fecha pelo OK: Escape (e o botão voltar do Android, que
 * o app converte em Escape quando há diálogo aberto) é bloqueado, e o
 * AlertDialog já não fecha ao tocar fora.
 */
export function DesdobroCadastralDialog({
  open,
  onConfirm,
}: {
  open: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent onEscapeKeyDown={(e) => e.preventDefault()}>
        <AlertDialogHeader>
          {/* Uma linha só em qualquer tela: sem quebra e fonte proporcional à
              largura (mesmo critério do "A equipe já almoçou?"). */}
          <AlertDialogTitle
            className="flex items-center gap-2 whitespace-nowrap"
            style={{ fontSize: "clamp(0.75rem, 4.5vw, 1.125rem)" }}
          >
            <AlertTriangle className="size-[1.25em] shrink-0 text-[#EF5350]" aria-hidden="true" />
            Desdobro de cadastral
          </AlertDialogTitle>
          <AlertDialogDescription>
            Não esqueça de abrir desdobro posterior de <strong>CADASTRAL COD. 202004</strong>. Caso tenha
            esquecido comunique ao líder imediatamente.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={onConfirm}>OK</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
