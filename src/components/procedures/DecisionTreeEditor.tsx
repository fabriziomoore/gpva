import { useState } from "react";
import { DecisionTree, DecisionNode } from "@/lib/procedures/tree-validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, ArrowRight, HelpCircle, CheckCircle } from "lucide-react";

interface DecisionTreeEditorProps {
  value: DecisionTree;
  onChange: (value: DecisionTree) => void;
}

export function DecisionTreeEditor({ value, onChange }: DecisionTreeEditorProps) {
  const [activeNodeId, setActiveNodeId] = useState<string | null>(value.startNodeId);

  const addNode = (type: "question" | "result") => {
    const newId = `node_${Date.now()}`;
    const newNode: DecisionNode = type === "question" 
      ? { id: newId, type: "question", text: "", answers: [{ label: "Sim", nextNodeId: "" }] }
      : { id: newId, type: "result", title: "", instruction: "" };
    
    onChange({
      ...value,
      nodes: [...value.nodes, newNode],
    });
    setActiveNodeId(newId);
  };

  const updateNode = (id: string, updates: Partial<DecisionNode>) => {
    onChange({
      ...value,
      nodes: value.nodes.map(n => n.id === id ? { ...n, ...updates } as DecisionNode : n),
    });
  };

  const removeNode = (id: string) => {
    if (value.startNodeId === id) {
      alert("Não é possível remover o nó inicial.");
      return;
    }
    onChange({
      ...value,
      nodes: value.nodes.filter(n => n.id !== id),
    });
    if (activeNodeId === id) setActiveNodeId(value.startNodeId);
  };

  const activeNode = value.nodes.find(n => n.id === activeNodeId);

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-6 min-h-[500px]">
      <div className="md:col-span-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Estrutura</h3>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => addNode("question")} title="Nova Pergunta">
              <HelpCircle className="size-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={() => addNode("result")} title="Novo Resultado">
              <CheckCircle className="size-4" />
            </Button>
          </div>
        </div>
        
        <div className="space-y-2 overflow-y-auto max-h-[600px] pr-2">
          {value.nodes.map((node) => (
            <Button
              key={node.id}
              variant={activeNodeId === node.id ? "default" : "outline"}
              className="w-full justify-start text-left h-auto py-2"
              onClick={() => setActiveNodeId(node.id)}
            >
              <div className="flex flex-col gap-0.5 w-full">
                <div className="flex items-center justify-between w-full">
                  <span className="text-[10px] uppercase font-bold opacity-60">
                    {node.type === "question" ? "Pergunta" : "Resultado"}
                  </span>
                  {value.startNodeId === node.id && (
                    <Badge variant="outline" className="text-[9px] h-4">Início</Badge>
                  )}
                </div>
                <span className="truncate text-sm font-medium">
                  {node.type === "question" ? (node as any).text || "Sem texto..." : (node as any).title || "Sem título..."}
                </span>
              </div>
            </Button>
          ))}
        </div>
      </div>

      <div className="md:col-span-8">
        {activeNode ? (
          <Card className="h-full border-primary/20 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between py-4">
              <CardTitle className="text-base">Editar {activeNode.type === "question" ? "Pergunta" : "Resultado"}</CardTitle>
              {activeNode.id !== value.startNodeId && (
                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => removeNode(activeNode.id)}>
                  <Trash2 className="size-4" />
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-muted-foreground">ID do Nó</label>
                <Input value={activeNode.id} readOnly className="bg-muted text-muted-foreground" />
              </div>

              {activeNode.type === "question" ? (
                <>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-muted-foreground">Texto da Pergunta</label>
                    <Textarea 
                      value={activeNode.text} 
                      onChange={(e) => updateNode(activeNode.id, { text: e.target.value })}
                      placeholder="Ex: O HD é interno?"
                    />
                  </div>

                  <div className="space-y-3">
                    <label className="text-xs font-bold uppercase text-muted-foreground">Respostas e Caminhos</label>
                    {activeNode.answers.map((ans, idx) => (
                      <div key={idx} className="flex gap-2 items-start bg-muted/30 p-3 rounded-lg border border-border">
                        <div className="flex-1 space-y-2">
                          <Input 
                            value={ans.label} 
                            onChange={(e) => {
                              const newAns = [...activeNode.answers];
                              newAns[idx].label = e.target.value;
                              updateNode(activeNode.id, { answers: newAns });
                            }}
                            placeholder="Rótulo (ex: Sim)"
                          />
                          <select 
                            className="w-full flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            value={ans.nextNodeId}
                            onChange={(e) => {
                              const newAns = [...activeNode.answers];
                              newAns[idx].nextNodeId = e.target.value;
                              updateNode(activeNode.id, { answers: newAns });
                            }}
                          >
                            <option value="">Selecione o próximo nó...</option>
                            {value.nodes.filter(n => n.id !== activeNode.id).map(n => (
                              <option key={n.id} value={n.id}>
                                [{n.type.toUpperCase()}] {n.type === "question" ? (n as any).text : (n as any).title}
                              </option>
                            ))}
                          </select>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-destructive shrink-0"
                          onClick={() => {
                            const newAns = activeNode.answers.filter((_, i) => i !== idx);
                            updateNode(activeNode.id, { answers: newAns });
                          }}
                          disabled={activeNode.answers.length <= 1}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    ))}
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full dashed border-dashed"
                      onClick={() => {
                        const newAns = [...activeNode.answers, { label: "", nextNodeId: "" }];
                        updateNode(activeNode.id, { answers: newAns });
                      }}
                    >
                      <Plus className="size-4 mr-2" /> Adicionar Resposta
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-muted-foreground">Título do Resultado</label>
                    <Input 
                      value={activeNode.title} 
                      onChange={(e) => updateNode(activeNode.id, { title: e.target.value })}
                      placeholder="Ex: Procedimento Indicado"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-muted-foreground">Instrução Técnica</label>
                    <Textarea 
                      value={activeNode.instruction} 
                      onChange={(e) => updateNode(activeNode.id, { instruction: e.target.value })}
                      placeholder="Descreva o passo a passo..."
                      className="min-h-[150px]"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-muted-foreground">Justificativa (Opcional)</label>
                    <Textarea 
                      value={activeNode.reason || ""} 
                      onChange={(e) => updateNode(activeNode.id, { reason: e.target.value })}
                      placeholder="Por que seguir este caminho?"
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="h-full flex items-center justify-center border-2 border-dashed border-primary/10 rounded-2xl bg-muted/5 p-8 text-center">
            <div>
              <HelpCircle className="size-12 text-muted-foreground mx-auto mb-4 opacity-20" />
              <h3 className="text-lg font-semibold text-muted-foreground">Nenhum nó selecionado</h3>
              <p className="text-muted-foreground mt-1">
                Selecione um nó na lista à esquerda ou crie um novo.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Badge({ children, variant = "default", className = "" }: { children: React.ReactNode, variant?: "default" | "outline", className?: string }) {
  const base = "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";
  const variants = {
    default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
    outline: "text-foreground border border-input hover:bg-accent hover:text-accent-foreground"
  };
  return <div className={`${base} ${variants[variant]} ${className}`}>{children}</div>;
}
