import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Search, FileText, AlertCircle, ArrowRight, User } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useIsLeader } from "@/hooks/use-is-leader";
import { useAuthSession } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/leader-procedures")({
  component: LeaderProceduresPage,
});

function LeaderProceduresPage() {
  const { userId } = useAuthSession();
  const isLeader = useIsLeader(userId);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  const { data: procedures, isLoading } = useQuery({
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
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  if (!isLeader.data) {
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
        return <Badge className="bg-green-500 hover:bg-green-600">Publicado</Badge>;
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
        <Button size="lg" className="shrink-0 gap-2 shadow-lg hover:shadow-xl transition-all">
          <Plus className="size-5" />
          Novo Procedimento
        </Button>
      </div>

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

      {isLoading ? (
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
                  {getStatusBadge(proc.status)}
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted px-2 py-0.5 rounded">
                    v{proc.versao}
                  </span>
                </div>
                <CardTitle className="text-lg line-clamp-1 group-hover:text-primary transition-colors">{proc.titulo}</CardTitle>
                <CardDescription className="line-clamp-2 min-h-[2.5rem] mt-1">
                  {proc.descricao || "Sem descrição informada."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 p-2 rounded-lg">
                    <User className="size-3.5 shrink-0" />
                    <span className="truncate">Versão: {proc.versao}</span>
                  </div>
                  
                  <div className="flex flex-col gap-1.5 pt-2">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground uppercase tracking-tight">
                      <span>Vigência</span>
                      <span className="font-semibold text-foreground/80">
                        {format(new Date(proc.vigencia_inicio), "dd/MM/yy", { locale: ptBR })}
                        {proc.vigencia_fim && ` — ${format(new Date(proc.vigencia_fim), "dd/MM/yy", { locale: ptBR })}`}
                      </span>
                    </div>
                  </div>

                  <Button variant="secondary" className="w-full mt-2 group-hover:bg-primary group-hover:text-primary-foreground transition-all">
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
