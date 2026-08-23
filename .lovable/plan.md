# Plano de Correção Cirúrgica — Trigger de Integridade (v2)

## Objetivo
Corrigir a função  para implementar regras de integridade e imutabilidade rigorosas, sem alterar a arquitetura de permissões ou triggers existente.

## Alterações Propostas

### 1. Regras por Estado (UPDATE)

#### DRAFT
Para registros onde o estado atual (OLD.status) é 'draft':
- Permitir transição 'draft' -> 'draft'.
- Manter editabilidade dos campos conforme regras atuais.
- Se  mudar, validar via .
- **BLOQUEAR**: 'draft' -> 'published', 'draft' -> 'suspended', 'draft' -> 'archived'.

#### IMUTABILIDADE HISTÓRICA
Permitir apenas as seguintes transições:
- 'published' -> 'suspended'
- 'published' -> 'archived'
- 'suspended' -> 'archived'

Nestas transições, permitir alteração **APENAS** de:
- 
- 
- 

**BLOQUEAR** alteração de todos os outros campos (comparados via ):
uid=0(root) gid=0(root) groups=0(root), , , , , , , , , , , , , , , , .

### 2. Saneamento Técnico
- **Remover ** (usar default INVOKER).
- Remover referências a ,  ou lógica de identidade interna.
- Substituir  e  por .
- Não usar ,  ou . Acessar  diretamente como boolean.

### 3. Congelamento de Escopo
- Não alterar: , , RLS, roles, memberships, frontend ou estrutura de tabelas.
- Manter o trigger  exatamente como está: .

### 4. Entrega
- Criar **EXATAMENTE UMA** nova migration SQL.

## Validação Pós-Execução
-  na função.
- Ausência de: , , , , , , .
-  continua retornando .
- Apenas um trigger  ativo.