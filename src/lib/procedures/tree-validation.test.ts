import { describe, it, expect } from 'vitest';
import { validateDecisionTree, DecisionTree } from './tree-validation';

describe('validateDecisionTree', () => {
  it('should invalidate a tree without a root', () => {
    const tree: any = {
      startNodeId: 'non-existent',
      nodes: [
        { id: '1', type: 'result', title: 'Node 1', instruction: 'Test' }
      ]
    };
    const result = validateDecisionTree(tree);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('não encontrado');
  });

  it('should detect a simple valid path', () => {
    const tree: DecisionTree = {
      startNodeId: 'start',
      nodes: [
        { id: 'start', type: 'result', title: 'Resultado', instruction: 'Fim' }
      ]
    };
    const result = validateDecisionTree(tree);
    expect(result.valid).toBe(true);
  });

  it('should detect cycles', () => {
    const tree: DecisionTree = {
      startNodeId: 'A',
      nodes: [
        { 
          id: 'A', 
          type: 'question', 
          text: 'Q1', 
          answers: [{ label: 'Go to B', nextNodeId: 'B' }] 
        },
        { 
          id: 'B', 
          type: 'question', 
          text: 'Q2', 
          answers: [{ label: 'Go back to A', nextNodeId: 'A' }] 
        },
        { id: 'R', type: 'result', title: 'R', instruction: 'I' }
      ]
    };
    const result = validateDecisionTree(tree);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Ciclo infinito'))).toBe(true);
  });

  it('should detect dead ends (question without path to result)', () => {
    const tree: DecisionTree = {
      startNodeId: 'Q',
      nodes: [
        { 
          id: 'Q', 
          type: 'question', 
          text: 'Sem saída', 
          answers: [{ label: 'Loop', nextNodeId: 'Q' }] 
        },
        { id: 'R', type: 'result', title: 'R', instruction: 'I' }
      ]
    };
    const result = validateDecisionTree(tree);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Caminho sem saída'))).toBe(true);
  });
});
