import { useState } from "react";
import { ArrowLeft, CheckCircle2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DecisionTree } from "@/lib/procedures/tree-validation";

// Sim/Não são as respostas mais comuns nas árvores de decisão — colorir
// de verde/vermelho deixa óbvio de relance qual caminho leva a qual
// resultado, sem precisar ler o rótulo. Fixo nas duas cores em qualquer
// tema (só o fundo do título segue claro/escuro).
function answerColorClasses(label: string) {
  const normalized = label.trim().toLowerCase();
  if (normalized === "sim") return "border-transparent bg-green-600 text-white hover:bg-green-700";
  if (normalized === "não" || normalized === "nao") return "border-transparent bg-red-600 text-white hover:bg-red-700";
  return "";
}

/**
 * Percorre a árvore de decisão publicada por um líder, uma pergunta por
 * vez, até chegar num resultado — é a "consulta rápida" da equipe (o
 * DecisionTreeEditor é só a ferramenta de autoria do líder, não isso).
 */
export function ProcedurePlayer({ tree }: { tree: DecisionTree }) {
  const [path, setPath] = useState<string[]>([tree.startNodeId]);
  const currentId = path[path.length - 1];
  const node = tree.nodes.find((n) => n.id === currentId);

  function choose(nextNodeId: string) {
    setPath((p) => [...p, nextNodeId]);
  }
  function back() {
    setPath((p) => (p.length > 1 ? p.slice(0, -1) : p));
  }
  function restart() {
    setPath([tree.startNodeId]);
  }

  if (!node) {
    return (
      <p className="text-sm text-destructive">
        Este procedimento está com a árvore de decisão inválida. Avise o líder.
      </p>
    );
  }

  const titleText = node.type === "question" ? node.text : node.title;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-xl bg-primary px-3 py-2.5">
        {path.length > 1 && (
          <button
            type="button"
            onClick={back}
            aria-label="Voltar"
            className="-ml-1 shrink-0 rounded-md p-1 text-primary-foreground/90 transition-colors hover:text-primary-foreground"
          >
            <ArrowLeft className="size-5" />
          </button>
        )}
        <p className="flex-1 truncate text-base font-semibold leading-snug text-primary-foreground">
          {titleText}
        </p>
      </div>

      {node.type === "question" ? (
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
      ) : (
        <div className="space-y-4 rounded-2xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-center gap-2 text-primary">
            <CheckCircle2 className="size-5 shrink-0" />
            <p className="text-xs font-bold uppercase tracking-wide">Procedimento indicado</p>
          </div>
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
}
