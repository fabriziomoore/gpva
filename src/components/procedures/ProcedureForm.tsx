import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DecisionTreeEditor } from "./DecisionTreeEditor";
import { DecisionTree, validateDecisionTree } from "@/lib/procedures/tree-validation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Save, Send, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const formSchema = z.object({
  titulo: z.string().min(5, "Título muito curto").max(100),
  descricao: z.string().max(500).optional(),
  categoria: z.string().min(1, "Categoria é obrigatória"),
  setor: z.string().min(1, "Setor/Aplicabilidade é obrigatório"),
  fonte: z.string().optional(),
  vigencia_inicio: z.string().min(1, "Data de início obrigatória"),
  vigencia_fim: z.string().optional(),
});

interface ProcedureFormProps {
  initialData?: any;
  onSubmit: (data: any, versionData: any, isPublishing: boolean) => Promise<void>;
  isSubmitting?: boolean;
  isReadOnly?: boolean;
}

const CATEGORIAS = ["Geral", "Técnico", "Comercial", "Segurança", "Operacional", "Outros"];

export function ProcedureForm({ initialData, onSubmit, isSubmitting, isReadOnly }: ProcedureFormProps) {
  const [tree, setTree] = useState<DecisionTree>(
    initialData?.arvore_decisao || {
      startNodeId: "root",
      nodes: [
        {
          id: "root",
          type: "question",
          text: "Qual o problema identificado?",
          answers: [{ label: "Opção 1", nextNodeId: "" }],
        },
      ],
    }
  );

  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      titulo: initialData?.titulo || "",
      descricao: initialData?.descricao || "",
      categoria: initialData?.categoria || "Geral",
      setor: initialData?.setor || "",
      fonte: initialData?.fonte || "",
      vigencia_inicio: initialData?.vigencia_inicio 
        ? new Date(initialData.vigencia_inicio).toISOString().split('T')[0] 
        : new Date().toISOString().split('T')[0],
      vigencia_fim: initialData?.vigencia_fim 
        ? new Date(initialData.vigencia_fim).toISOString().split('T')[0] 
        : "",
    },
  });

  const handleAction = async (isPublishing: boolean) => {
    const values = form.getValues();
    const isValid = await form.trigger();
    
    if (!isValid) return;

    // Validação profunda da árvore
    const validation = validateDecisionTree(tree);
    if (!validation.valid) {
      setValidationErrors(validation.errors);
      toast.error("Existem erros na árvore de decisão que precisam ser corrigidos.");
      return;
    }

    setValidationErrors([]);
    await onSubmit(values, { arvore_decisao: tree }, isPublishing);
  };

  return (
    <Form {...form}>
      <div className="space-y-8">
        {validationErrors.length > 0 && (
          <Alert variant="destructive" className="animate-in fade-in slide-in-from-top-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Erros de Validação da Árvore</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-5 mt-2 space-y-1 text-sm">
                {validationErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="metadata" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="metadata">Dados Gerais</TabsTrigger>
            <TabsTrigger value="tree">Fluxograma de Decisão</TabsTrigger>
          </TabsList>

          <TabsContent value="metadata">
            <Card className="border-primary/10 shadow-sm">
              <CardContent className="pt-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="titulo"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel className="font-bold">Título do Procedimento</FormLabel>
                        <FormControl>
                          <Input placeholder="Ex: Manutenção de Ponto de Rede" {...field} disabled={isReadOnly} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="categoria"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-bold">Categoria</FormLabel>
                        <Select 
                          onValueChange={field.onChange} 
                          defaultValue={field.value}
                          disabled={isReadOnly}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione uma categoria" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {CATEGORIAS.map(cat => (
                              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="setor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-bold">Setor / Aplicabilidade</FormLabel>
                        <FormControl>
                          <Input placeholder="Ex: Operação Água" {...field} disabled={isReadOnly} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="descricao"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-bold">Descrição (Opcional)</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Breve resumo do objetivo deste procedimento..." 
                          className="min-h-[80px]"
                          {...field} 
                          disabled={isReadOnly}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="fonte"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-bold">Fonte / Origem da Orientação</FormLabel>
                      <FormControl>
                        <Input placeholder="Ex: Norma ABNT 123, Manual do Fabricante..." {...field} disabled={isReadOnly} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="vigencia_inicio"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-bold">Início da Vigência</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} disabled={isReadOnly} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="vigencia_fim"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-bold">Fim da Vigência (Opcional)</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} disabled={isReadOnly} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tree">
            <DecisionTreeEditor value={tree} onChange={setTree} isReadOnly={isReadOnly} />
          </TabsContent>
        </Tabs>

        {!isReadOnly && (
          <div className="flex justify-end gap-4 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => window.history.back()}>
              Cancelar
            </Button>
            
            <Button 
              type="button" 
              variant="secondary"
              disabled={isSubmitting} 
              onClick={() => handleAction(false)}
              className="min-w-[150px]"
            >
              {isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Salvar Rascunho
            </Button>

            <Button 
              type="button"
              disabled={isSubmitting} 
              onClick={() => handleAction(true)}
              className="min-w-[150px] shadow-lg bg-green-600 hover:bg-green-700 text-white"
            >
              {isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Publicar Agora
            </Button>
          </div>
        )}
      </div>
    </Form>
  );
}
