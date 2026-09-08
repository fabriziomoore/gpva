import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DecisionTree } from "@/lib/procedures/tree-validation";

// Sim/Não são as respostas mais comuns nas árvores de decisão — colorir
// de verde/vermelho deixa óbvio de relance qual caminho leva a qual
// resultado, sem precisar ler o rótulo. Fixo nas duas cores em qualquer
// tema.
function answerColorClasses(label: string) {
  const normalized = label.trim().toLowerCase();
  if (normalized === "sim") return "border-transparent bg-green-600 text-white hover:bg-green-700";
  if (normalized === "não" || normalized === "nao") return "border-transparent bg-red-600 text-white hover:bg-red-700";
  return "";
}

export interface ProcedurePlayerHandle {
  back: () => void;
}

interface ProcedurePlayerProps {
  tree: DecisionTree;
  /** Avisa quem está usando o player se dá pra voltar um passo — o botão
   * de voltar em si mora no cabeçalho do diálogo, junto do título do
   * procedimento, não aqui dentro. */
  onPathChange?: (canGoBack: boolean) => void;
}

/**
 * Percorre a árvore de decisão publicada por um líder, uma pergunta por
 * vez, até chegar num resultado — é a "consulta rápida" da equipe (o
 * DecisionTreeEditor é só a ferramenta de autoria do líder, não isso).
 */
export const ProcedurePlayer = forwardRef<ProcedurePlayerHandle, ProcedurePlayerProps>(
  function ProcedurePlayer({ tree, onPathChange }, ref) {
    const [path, setPath] = useState<string[]>([tree.startNodeId]);
    const currentId = path[path.length - 1];
    const node = tree.nodes.find((n) => n.id === currentId);

    function back() {
      setPath((p) => (p.length > 1 ? p.slice(0, -1) : p));
    }
    function choose(nextNodeId: string) {
      setPath((p) => [...p, nextNodeId]);
    }
    function restart() {
      setPath([tree.startNodeId]);
    }

    useImperativeHandle(ref, () => ({ back }), []);
    useEffect(() => {
      onPathChange?.(path.length > 1);
    }, [path, onPathChange]);

    if (!node) {
      return (
        <p className="text-sm text-destructive">
          Este procedimento está com a árvore de decisão inválida. Avise o líder.
        </p>
      );
    }

    return (
      <div className="space-y-4">
        {node.type === "question" ? (
          <div className="space-y-3">
            <p className="text-lg font-semibold leading-snug text-foreground">{node.text}</p>
            <div className={cn("gap-2", node.answers.length === 2 ? "grid grid-cols-2" : "space-y-2")}>
              {node.answers.map((ans, i) => (
                <Button
                  key={i}
                  variant="outline"
                  className={cn(
                    "h-auto w-full whitespace-normal py-3 text-base",
                    node.answers.length === 2 ? "text-center" : "text-left",
                    answerColorClasses(ans.label),
                  )}
                  onClick={() => choose(ans.nextNodeId)}
                >
                  {ans.label}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4 rounded-2xl border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-center gap-2 text-primary">
              <CheckCircle2 className="size-5 shrink-0" />
              <p className="text-xs font-bold uppercase tracking-wide">Procedimento indicado</p>
            </div>
            <p className="text-lg font-semibold text-foreground">{node.title}</p>
            <p className="whitespace-pre-wrap text-sm text-foreground/90">{node.instruction}</p>
            {node.reason && (
              <p className="border-t border-border pt-3 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">Por quê: </span>
                {node.reason}
              </p>
            )}
            <Button variant="secondary" className="w-full" onClick={restart}>
              <RotateCcw className="mr-2 size-4" />
              Recomeçar
            </Button>
          </div>
        )}
      </div>
    );
  },
);
