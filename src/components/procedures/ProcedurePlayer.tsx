import { useState } from "react";
import { ArrowLeft, CheckCircle2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DecisionTree } from "@/lib/procedures/tree-validation";

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

  return (
    <div className="space-y-4">
      {path.length > 1 && (
        <button
          type="button"
          onClick={back}
          className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Voltar
        </button>
      )}

      {node.type === "question" ? (
        <div className="space-y-3">
          <p className="text-lg font-semibold leading-snug text-foreground">{node.text}</p>
          <div className="space-y-2">
            {node.answers.map((ans, i) => (
              <Button
                key={i}
                variant="outline"
                className="h-auto w-full whitespace-normal py-3 text-left text-base"
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
}
