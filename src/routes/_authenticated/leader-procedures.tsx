import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Search, FileText, AlertCircle, ArrowRight, User, MoreVertical, Archive, PauseCircle, PlayCircle, History, Trash2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useUserRoles } from "@/hooks/use-user-roles";
import { useAuthSession } from "@/hooks/use-auth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ProcedureForm } from "@/components/procedures/ProcedureForm";
import { toast } from "sonner";
import { newId } from "@/lib/db/local-db";

export const Route = createFileRoute("/_authenticated/leader-procedures")({
  component: LeaderProceduresPage,
});

function LeaderProceduresPage() {
  const { userId, session } = useAuthSession();
  const userRoles = useUserRoles(userId);
  const isLeaderOrAdmin = userRoles.data?.some((r: string) => r === 'leader' || r === 'admin') || 
    session?.user.user_metadata?.is_leader === true ||
    session?.user.user_metadata?.is_admin === true;
  
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingProcedure, setEditingProcedure] = useState<any>(null);
  const [confirmPublish, setConfirmPublish] = useState<any>(null);
  
  const queryClient = useQueryClient();

  const { data: procedures, isLoading, error: queryError } = useQuery({
    queryKey: ["leader-procedures", activeTab, searchTerm],
    queryFn: async () => {
      let query = supabase
        .from("procedimento_versoes")
        .select(`
          *,
          procedimento:procedimentos(nome_logico)
        `)
        .order("created_at", { ascending: false });

      if (activeTab !== "all") {
        query = query.eq("status", activeTab as any);
      }

      if (searchTerm) {
        query = query.ilike("titulo", `%${searchTerm}%`);
      }

      const { data, error } = await query;
      if (error) {
        console.error("Error fetching procedures:", error);
        throw error;
      }
      return data;
    },
    enabled: !!userId && isLeaderOrAdmin,
  });

  const createMutation = useMutation({
    mutationFn: async ({ metadata, versionData, isPublishing }: { metadata: any; versionData: any; isPublishing: boolean }) => {
      if (!userId) throw new Error("Usuário não autenticado");

      // 1. Criação atômica (sempre como draft inicialmente via RPC ou insert)
      // Nota: A RPC create_procedure_with_version já cuida da atomicidade procedimento+versão
      const { data: procId, error: rpcError } = await supabase.rpc('create_procedure_with_version', {
        p_titulo: metadata.titulo,
        p_categoria: metadata.categoria,
        p_descricao: metadata.descricao || null,
        p_setor: metadata.setor,
        p_fonte: metadata.fonte || null,
        p_vigencia_inicio: metadata.vigencia_inicio,
        p_vigencia_fim: metadata.vigencia_fim || null,
        p_arvore_decisao: versionData.arvore_decisao
      });

      if (rpcError) throw rpcError;

      // 2. Se for para publicar, chamar a nova RPC de publicação
      if (isPublishing && procId) {
        const { data: versions } = await supabase
          .from("procedimento_versoes")
          .select("id")
          .eq("procedimento_id", procId)
          .order("created_at", { ascending: false })
          .limit(1);
        
        const versionId = versions?.[0]?.id;
        
        if (versionId) {
          // Omitir p_substitui_versao_id para V1 (proc recém criado não tem predecessor)
          const { error: pubError } = await supabase.rpc('publish_procedure_version', {
            p_versao_id: versionId,
            p_vigencia_inicio: metadata.vigencia_inicio,
          });
          
          if (pubError) throw pubError;
        }

      }


      return procId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leader-procedures"] });
      toast.success("Procedimento criado com sucesso!");
      setIsCreateDialogOpen(false);
    },
    onError: (error: any) => {
      console.error("Erro ao criar procedimento:", error);
      toast.error(`Falha ao criar procedimento: ${error.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, metadata, versionData, isPublishing }: { id: string; metadata: any; versionData: any; isPublishing: boolean }) => {
      if (!userId) throw new Error("Usuário não autenticado");

      // Atualiza o rascunho
      const { error } = await supabase
        .from("procedimento_versoes")
        .update({
          titulo: metadata.titulo,
          categoria: metadata.categoria,
          descricao: metadata.descricao || null,
          setor: metadata.setor,
          fonte: metadata.fonte || null,
          vigencia_inicio: metadata.vigencia_inicio,
          vigencia_fim: metadata.vigencia_fim || null,
          arvore_decisao: versionData.arvore_decisao,
        })
        .eq("id", id)
        .eq("status", "draft");

      if (error) throw error;

      // Se for para publicar, chama a RPC
      if (isPublishing) {
        const { error: pubError } = await supabase.rpc('publish_procedure_version', {
          p_versao_id: id,
          p_vigencia_inicio: metadata.vigencia_inicio,
          p_substitui_versao_id: undefined
        });
        if (pubError) throw pubError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leader-procedures"] });
      toast.success("Alterações salvas com sucesso!");
      setEditingProcedure(null);
    },
    onError: (error: any) => {
      toast.error(`Falha ao salvar: ${error.message}`);
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      // Bloqueia mudança para published via update direto
      if (status === 'published') {
        throw new Error("Publicação deve ser feita através da ação específica.");
      }
      const { error } = await supabase
        .from("procedimento_versoes")
        .update({ 
          status: status as any
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leader-procedures"] });
      toast.success("Status atualizado!");
    },
    onError: (error: any) => {
      toast.error(`Erro: ${error.message}`);
    },
  });

  const newVersionMutation = useMutation({
    mutationFn: async (prevVersion: any) => {
      if (!userId) throw new Error("Usuário não autenticado");
      
      const { data, error } = await supabase
        .from("procedimento_versoes")
        .insert({
          procedimento_id: prevVersion.procedimento_id,
          titulo: prevVersion.titulo,
          categoria: prevVersion.categoria,
          descricao: prevVersion.descricao,
          setor: prevVersion.setor,
          fonte: prevVersion.fonte,
          versao: prevVersion.versao + 1,
          status: "draft",
          arvore_decisao: prevVersion.arvore_decisao,
          vigencia_inicio: prevVersion.vigencia_inicio, // Mantém a da anterior para revisão
          substitui_versao_id: prevVersion.id,
          criado_por_id: userId,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["leader-procedures"] });
      toast.success("Nova versão draft criada!");
      setEditingProcedure(data);
    },
    onError: (error: any) => {
      toast.error(`Erro: ${error.message}`);
    },
  });

  const deleteDraftMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("procedimento_versoes")
        .delete()
        .eq("id", id)
        .eq("status", "draft");
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leader-procedures"] });
      toast.success("Rascunho excluído.");
    },
    onError: (error: any) => {
      toast.error(`Erro: ${error.message}`);
    },
  });

  if (!isLeaderOrAdmin && !userRoles.isLoading) {
    return (
      <div className="flex h-[80vh] items-center justify-center p-4">
        <Card className="max-w-md w-full text-center">
          <CardHeader>
            <AlertCircle className="size-12 text-destructive mx-auto mb-2" />
            <CardTitle>Acesso Negado</CardTitle>
            <CardDescription>
              Apenas líderes e administradores podem acessar a gestão de procedimentos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link to="/">Voltar para Início</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return <Badge variant="secondary">Rascunho</Badge>;
      case "published":
        return <Badge className="bg-green-500 hover:bg-green-600 text-white">Publicado</Badge>;
      case "suspended":
        return <Badge variant="destructive">Suspenso</Badge>;
      case "archived":
        return <Badge variant="outline">Arquivado</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="container mx-auto p-4 md:p-8 max-w-7xl animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Procedimentos</h1>
          <p className="text-muted-foreground mt-1">
            Gestão da biblioteca de procedimentos operacionais.
          </p>
        </div>
        <Button 
          size="lg" 
          className="shrink-0 gap-2 shadow-lg hover:shadow-xl transition-all"
          onClick={() => setIsCreateDialogOpen(true)}
        >
          <Plus className="size-5" />
          Novo Procedimento
        </Button>
      </div>

      {/* Dialog para Novo Procedimento */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo Procedimento Operacional</DialogTitle>
            <DialogDescription>
              Defina os metadados e o fluxograma de decisão para a primeira versão.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <ProcedureForm 
              onSubmit={async (metadata, versionData, isPublishing) => {
                if (!metadata) {
                  setIsCreateDialogOpen(false);
                  return;
                }

                if (isPublishing) {
                  setConfirmPublish({ metadata, versionData, isNew: true });
                } else {
                  await createMutation.mutateAsync({ metadata, versionData, isPublishing: false });
                }
              }}
              isSubmitting={createMutation.isPending}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog para Edição / Visualização */}
      <Dialog open={!!editingProcedure} onOpenChange={(open) => !open && setEditingProcedure(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingProcedure?.status === 'draft' ? 'Editar Rascunho' : 'Visualizar Procedimento'}
            </DialogTitle>
            <DialogDescription>
              {editingProcedure?.status === 'draft' 
                ? 'Altere o conteúdo do rascunho antes de publicar.' 
                : 'Versões publicadas são imutáveis. Crie uma nova versão para fazer alterações.'}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <ProcedureForm 
              initialData={editingProcedure}
              isReadOnly={editingProcedure?.status !== 'draft'}
              onSubmit={async (metadata, versionData, isPublishing) => {
                if (!metadata) {
                  setEditingProcedure(null);
                  return;
                }

                if (isPublishing) {
                  setConfirmPublish({ id: editingProcedure.id, metadata, versionData, isNew: false });
                } else {
                  await updateMutation.mutateAsync({ 
                    id: editingProcedure.id, 
                    metadata, 
                    versionData, 
                    isPublishing: false 
                  });
                }
              }}
              isSubmitting={updateMutation.isPending}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de Confirmação de Publicação */}
      <Dialog open={!!confirmPublish} onOpenChange={(open) => !open && setConfirmPublish(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Publicação</DialogTitle>
            <DialogDescription>
              Você está prestes a publicar esta versão. Uma vez publicada, o conteúdo será imutável e ficará disponível para as equipes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmPublish(null)}>
              Revisar mais
            </Button>
            <Button 
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={async () => {
                const { id, metadata, versionData, isNew } = confirmPublish;
                setConfirmPublish(null);
                if (isNew) {
                  await createMutation.mutateAsync({ metadata, versionData, isPublishing: true });
                } else {
                  await updateMutation.mutateAsync({ id, metadata, versionData, isPublishing: true });
                }
              }}
            >
              Confirmar e Publicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="mb-8 border-primary/10 shadow-sm bg-card/50 backdrop-blur-sm">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por título..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 bg-background/50 border-primary/20"
              />
            </div>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full md:w-auto">
              <TabsList className="bg-muted/50 border border-primary/10 p-1">
                <TabsTrigger value="all">Todos</TabsTrigger>
                <TabsTrigger value="draft">Rascunhos</TabsTrigger>
                <TabsTrigger value="published">Publicados</TabsTrigger>
                <TabsTrigger value="suspended">Suspensos</TabsTrigger>
                <TabsTrigger value="archived">Arquivados</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardContent>
      </Card>

      {queryError && (
        <Card className="mb-8 border-destructive/20 bg-destructive/5">
          <CardContent className="pt-6 text-destructive flex items-center gap-3">
            <AlertCircle className="size-5" />
            <p>Erro ao carregar dados: {(queryError as any).message || "Erro desconhecido"}. Verifique se as tabelas foram criadas no banco.</p>
          </CardContent>
        </Card>
      )}

      {isLoading || userRoles.isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse h-48 border-primary/5 bg-muted/20" />
          ))}
        </div>
      ) : procedures?.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed border-primary/10 rounded-2xl bg-muted/5">
          <FileText className="size-12 text-muted-foreground mx-auto mb-4 opacity-20" />
          <h3 className="text-lg font-semibold text-muted-foreground">Nenhum procedimento encontrado</h3>
          <p className="text-muted-foreground mt-1 max-w-xs mx-auto">
            Ajuste os filtros ou crie um novo procedimento para começar.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {procedures?.map((proc: any) => (
            <Card key={proc.id} className="group overflow-hidden border-primary/10 hover:border-primary/30 transition-all hover:shadow-md bg-card/40 backdrop-blur-sm">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start gap-2 mb-2">
                  <div className="flex gap-2 items-center">
                    {getStatusBadge(proc.status)}
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted px-2 py-0.5 rounded">
                      v{proc.versao}
                    </span>
                  </div>
                  
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreVertical className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditingProcedure(proc)}>
                        {proc.status === 'draft' ? (
                          <>
                            <ArrowRight className="size-4 mr-2" />
                            Editar Rascunho
                          </>
                        ) : (
                          <>
                            <FileText className="size-4 mr-2" />
                            Visualizar
                          </>
                        )}
                      </DropdownMenuItem>
                      
                      {proc.status === 'published' && (
                        <>
                          <DropdownMenuItem onClick={() => newVersionMutation.mutate(proc)}>
                            <History className="size-4 mr-2" />
                            Criar nova versão
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            className="text-amber-600"
                            onClick={() => statusMutation.mutate({ id: proc.id, status: 'suspended' })}
                          >
                            <PauseCircle className="size-4 mr-2" />
                            Suspender
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="text-destructive"
                            onClick={() => statusMutation.mutate({ id: proc.id, status: 'archived' })}
                          >
                            <Archive className="size-4 mr-2" />
                            Arquivar
                          </DropdownMenuItem>
                        </>
                      )}

                      {proc.status === 'suspended' && (
                        <DropdownMenuItem 
                          className="text-destructive"
                          onClick={() => statusMutation.mutate({ id: proc.id, status: 'archived' })}
                        >
                          <Archive className="size-4 mr-2" />
                          Arquivar
                        </DropdownMenuItem>
                      )}

                      {proc.status === 'draft' && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            className="text-destructive"
                            onClick={() => {
                              if (confirm("Tem certeza que deseja excluir este rascunho?")) {
                                deleteDraftMutation.mutate(proc.id);
                              }
                            }}
                          >
                            <Trash2 className="size-4 mr-2" />
                            Excluir Rascunho
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <CardTitle className="text-lg line-clamp-1 group-hover:text-primary transition-colors">{proc.titulo}</CardTitle>
                <CardDescription className="line-clamp-2 min-h-[2.5rem] mt-1 text-xs">
                  {proc.descricao || "Sem descrição informada."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground uppercase tracking-tight">
                    <span>Vigência</span>
                    <span className="font-semibold text-foreground/80">
                      {proc.vigencia_inicio.split('-').reverse().join('/')}
                      {proc.vigencia_fim && ` — ${proc.vigencia_fim.split('-').reverse().join('/')}`}
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <Badge variant="outline" className="text-[9px] font-normal">{proc.categoria}</Badge>
                    <Badge variant="outline" className="text-[9px] font-normal truncate">{proc.setor}</Badge>
                  </div>

                  <Button 
                    variant="secondary" 
                    className="w-full mt-2 group-hover:bg-primary group-hover:text-primary-foreground transition-all"
                    onClick={() => setEditingProcedure(proc)}
                  >
                    Gerenciar
                    <ArrowRight className="size-4 ml-2 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
