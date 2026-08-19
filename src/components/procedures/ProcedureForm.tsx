import { useState } from "react";
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
import { Loader2, Save, Send } from "lucide-react";
import { toast } from "sonner";

const formSchema = z.object({
  titulo: z.string().min(5, "Título muito curto").max(100),
  descricao: z.string().max(500).optional(),
  vigencia_inicio: z.string().min(1, "Data de início obrigatória"),
  vigencia_fim: z.string().optional(),
});

interface ProcedureFormProps {
  initialData?: any;
  onSubmit: (data: any, versionData: any) => Promise<void>;
  isSubmitting?: boolean;
}

export function ProcedureForm({ initialData, onSubmit, isSubmitting }: ProcedureFormProps) {
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

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      titulo: initialData?.titulo || "",
      descricao: initialData?.descricao || "",
      vigencia_inicio: initialData?.vigencia_inicio 
        ? new Date(initialData.vigencia_inicio).toISOString().split('T')[0] 
        : new Date().toISOString().split('T')[0],
      vigencia_fim: initialData?.vigencia_fim 
        ? new Date(initialData.vigencia_fim).toISOString().split('T')[0] 
        : "",
    },
  });

  const handleFormSubmit = async (values: z.infer<typeof formSchema>) => {
    // Validação profunda da árvore
    const treeError = validateDecisionTree(tree);
    if (treeError) {
      toast.error(`Erro na árvore de decisão: ${treeError}`);
      return;
    }

    await onSubmit(values, { arvore_decisao: tree });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-8">
        <Tabs defaultValue="metadata" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="metadata">Dados Gerais</TabsTrigger>
            <TabsTrigger value="tree">Fluxograma de Decisão</TabsTrigger>
          </TabsList>

          <TabsContent value="metadata">
            <Card className="border-primary/10">
              <CardContent className="pt-6 space-y-6">
                <FormField
                  control={form.control}
                  name="titulo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-bold">Título do Procedimento</FormLabel>
                      <FormControl>
                        <Input placeholder="Ex: Manutenção de Ponto de Rede" {...field} />
                      </FormControl>
                      <FormDescription>
                        Um título claro e conciso para fácil identificação.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="descricao"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-bold">Descrição (Opcional)</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Breve resumo do objetivo deste procedimento..." 
                          className="min-h-[100px]"
                          {...field} 
                        />
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
                          <Input type="date" {...field} />
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
                          <Input type="date" {...field} />
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
            <DecisionTreeEditor value={tree} onChange={setTree} />
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-4 pt-4 border-t border-border">
          <Button type="button" variant="outline" onClick={() => window.history.back()}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting} className="min-w-[150px] shadow-lg">
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Salvar Rascunho
              </>
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
