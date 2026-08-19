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
  const nodesMap = new Map(tree.nodes.map(n => [n.id, n]));
  const nodeIds = Array.from(nodesMap.keys());

  // 1. startNodeId existe
  if (!nodesMap.has(tree.startNodeId)) {
    errors.push(`Nó inicial "${tree.startNodeId}" não encontrado na lista de nós.`);
    return { valid: false, errors };
  }

  // 2. IDs são únicos (já garantido pelo Map e input)
  if (nodeIds.length !== tree.nodes.length) {
    errors.push("Existem IDs de nós duplicados.");
  }

  // 3. Validação básica de campos
  let hasResult = false;
  tree.nodes.forEach(node => {
    if (node.type === "result") {
      hasResult = true;
      if (!node.title.trim()) errors.push(`Nó resultado "${node.id}" está sem título.`);
      if (!node.instruction.trim()) errors.push(`Nó resultado "${node.id}" está sem instrução.`);
    } else {
      if (!node.text.trim()) errors.push(`Nó pergunta "${node.id}" está sem texto.`);
      if (node.answers.length === 0) {
        errors.push(`Nó pergunta "${node.id}" deve ter pelo menos uma resposta.`);
      }
      node.answers.forEach((ans, idx) => {
        if (!ans.label.trim()) errors.push(`Resposta ${idx + 1} do nó "${node.id}" está sem rótulo.`);
        if (!ans.nextNodeId) {
          errors.push(`Resposta "${ans.label}" do nó "${node.id}" não aponta para nenhum nó.`);
        } else if (!nodesMap.has(ans.nextNodeId)) {
          errors.push(`Nó "${node.id}" referencia um próximo nó inexistente "${ans.nextNodeId}".`);
        }
      });
    }
  });

  if (!hasResult) {
    errors.push("A árvore deve ter pelo menos um nó de resultado final.");
    return { valid: false, errors };
  }

  // 4. Detecção de Ciclos e Caminhos sem Saída via DFS
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const reachesResult = new Set<string>();

  function dfs(nodeId: string): boolean {
    if (recStack.has(nodeId)) {
      errors.push(`Ciclo infinito detectado envolvendo o nó "${nodeId}".`);
      return false;
    }
    if (visited.has(nodeId)) return reachesResult.has(nodeId);

    visited.add(nodeId);
    recStack.add(nodeId);

    const node = nodesMap.get(nodeId);
    if (!node) {
      recStack.delete(nodeId);
      return false;
    }

    if (node.type === "result") {
      reachesResult.add(nodeId);
      recStack.delete(nodeId);
      return true;
    }

    let leadsToResult = false;
    for (const ans of node.answers) {
      if (dfs(ans.nextNodeId)) {
        leadsToResult = true;
      }
    }

    if (!leadsToResult) {
      errors.push(`Caminho sem saída detectado a partir do nó "${nodeId}". Todos os caminhos devem terminar em um Resultado.`);
    } else {
      reachesResult.add(nodeId);
    }

    recStack.delete(nodeId);
    return leadsToResult;
  }

  // Iniciar DFS a partir do nó raiz
  dfs(tree.startNodeId);

  // Verificar se existem nós órfãos (opcional, mas bom para limpeza)
  tree.nodes.forEach(node => {
    if (!visited.has(node.id)) {
      // errors.push(`Aviso: O nó "${node.id}" não é alcançável a partir do início.`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}
