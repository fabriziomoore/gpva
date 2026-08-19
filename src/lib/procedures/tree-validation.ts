import { z } from "zod";

export const DecisionNodeSchema = z.discriminatedUnion("type", [
  z.object({
    id: z.string(),
    type: z.literal("question"),
    text: z.string().min(1, "Texto da pergunta é obrigatório"),
    answers: z.array(z.object({
      label: z.string().min(1, "Rótulo da resposta é obrigatório"),
      nextNodeId: z.string().min(1, "Próximo nó é obrigatório"),
    })).min(1, "A pergunta deve ter pelo menos uma resposta"),
  }),
  z.object({
    id: z.string(),
    type: z.literal("result"),
    title: z.string().min(1, "Título do resultado é obrigatório"),
    instruction: z.string().min(1, "Instrução é obrigatória"),
    reason: z.string().optional(),
  }),
]);

export const DecisionTreeSchema = z.object({
  startNodeId: z.string().min(1, "Nó inicial é obrigatório"),
  nodes: z.array(DecisionNodeSchema).min(1, "A árvore deve ter pelo menos um nó"),
});

export type DecisionNode = z.infer<typeof DecisionNodeSchema>;
export type DecisionTree = z.infer<typeof DecisionTreeSchema>;

export function validateDecisionTree(tree: DecisionTree): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const nodeIds = new Set(tree.nodes.map(n => n.id));

  if (!nodeIds.has(tree.startNodeId)) {
    errors.push(`Nó inicial "${tree.startNodeId}" não encontrado na lista de nós.`);
  }

  if (nodeIds.size !== tree.nodes.length) {
    errors.push("Existem IDs de nós duplicados.");
  }

  let hasResult = false;
  tree.nodes.forEach(node => {
    if (node.type === "result") {
      hasResult = true;
    } else {
      node.answers.forEach(ans => {
        if (!nodeIds.has(ans.nextNodeId)) {
          errors.push(`Nó "${node.id}" referencia o próximo nó inexistente "${ans.nextNodeId}".`);
        }
      });
    }
  });

  if (!hasResult) {
    errors.push("A árvore deve ter pelo menos um nó de resultado final.");
  }

  // Verificar se todos os nós levam a um resultado (simplificado para MVP)
  // TODO: Implementar DFS para garantir terminação de todos os caminhos alcançáveis

  return {
    valid: errors.length === 0,
    errors,
  };
}
