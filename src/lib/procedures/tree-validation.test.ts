import { describe, it, expect } from 'vitest';
import { validateDecisionTree } from './tree-validation';

describe('validateDecisionTree', () => {
  it('should invalidate an empty tree', () => {
    const nodes: any[] = [];
    const result = validateDecisionTree(nodes);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('A árvore deve conter pelo menos um nó.');
  });

  it('should invalidate a tree without a root', () => {
    const nodes = [
      { id: '1', type: 'instruction', label: 'Node 1', data: { text: 'Test' } }
    ];
    const result = validateDecisionTree(nodes);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('A árvore deve ter exatamente um nó inicial (root).');
  });

  it('should detect a simple sequence', () => {
    const nodes = [
      { id: 'start', type: 'root', label: 'Início', data: {} },
      { id: 'step1', type: 'instruction', label: 'Passo 1', data: { text: 'Fazer algo' }, parentId: 'start' }
    ];
    const result = validateDecisionTree(nodes);
    expect(result.isValid).toBe(true);
  });

  it('should detect cycles', () => {
    const nodes = [
      { id: 'start', type: 'root', label: 'Início', data: {} },
      { id: 'step1', type: 'instruction', label: 'Passo 1', data: { text: 'A' }, parentId: 'start' },
      { id: 'step2', type: 'instruction', label: 'Passo 2', data: { text: 'B' }, parentId: 'step1' },
      { id: 'step1', type: 'instruction', label: 'Passo 1-bis', data: { text: 'A' }, parentId: 'step2' }
    ];
    // In our implementation, duplicate IDs are not allowed by Zod, but cycles with different IDs:
    const nodesCycle = [
      { id: 'start', type: 'root', label: 'Início', data: {} },
      { id: 'A', type: 'instruction', label: 'A', data: { text: 'A' }, parentId: 'start' },
      { id: 'B', type: 'instruction', label: 'B', data: { text: 'B' }, parentId: 'C' },
      { id: 'C', type: 'instruction', label: 'C', data: { text: 'C' }, parentId: 'B' }
    ];
    const result = validateDecisionTree(nodesCycle);
    expect(result.isValid).toBe(false);
  });

  it('should detect dead ends (questions without answers)', () => {
    const nodes = [
      { id: 'start', type: 'root', label: 'Início', data: {} },
      { id: 'q1', type: 'question', label: 'Pergunta 1', data: { text: 'Ok?' }, parentId: 'start' }
    ];
    const result = validateDecisionTree(nodes);
    expect(result.isValid).toBe(false);
    expect(result.errors).some(e => e.includes('Pergunta 1') && e.includes('não possui opções'));
  });
});
