import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useDealsQuery, useDealsListQuery, useDealsRealtime, useDealMutation,
  useDealBulkMutation, DEALS_PAGE_SIZE, type DealWithRelations,
} from "@/hooks/queries/useDeals";
import {
  usePipelinesQuery, useStagesQuery, useMembersQuery,
  useCompanyOptionsQuery, useContactOptionsQuery,
} from "@/hooks/queries/useOrgOptions";
import { TableSkeleton, CardSkeleton } from "@/components/crm/TableSkeleton";
import { EmptyState } from "@/components/crm/EmptyState";
import { useDebounce } from "@/hooks/useDebounce";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Kanban, List, TrendingUp, Plus, Filter, Settings2, Trash2, GripVertical, Loader2, Handshake, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DealsKanban } from "@/components/crm/DealsKanban";

import { DealsList } from "@/components/crm/DealsList";
import { DealsForecast } from "@/components/crm/DealsForecast";
import { DealsFilters, type DealFilters } from "@/components/crm/DealsFilters";
import type { Database } from "@/integrations/supabase/types";

type Deal = Database["public"]["Tables"]["deals"]["Row"];

// Reexportado: DealsKanban, DealsList e DealsForecast importam o tipo daqui
// desde antes de ele virar parte do módulo de queries.
export type { DealWithRelations };

type ViewMode = "kanban" | "list" | "forecast";

export default function Deals() {
  const { orgId } = useOrg();
  const { toast } = useToast();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [selectedPipeline, setSelectedPipeline] = useState<string>("");
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Deal | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const shouldOpenNew = searchParams.get("action") === "new";
  const [form, setForm] = useState<Partial<Deal>>({});
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<DealFilters>({});
  /*
   * Só a busca é debouncada, não o objeto `filters` inteiro: atrasar o objeto
   * faria escolher um responsável ou uma data esperar 300ms sem motivo. O
   * input segue controlado pelo valor imediato, então a digitação não trava.
   */
  const debouncedSearch = useDebounce(filters.search ?? "", 300);
  const [presetStageId, setPresetStageId] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  // Loss reason modal
  const [lossModalOpen, setLossModalOpen] = useState(false);
  const [lossDealId, setLossDealId] = useState<string | null>(null);
  const [lossReason, setLossReason] = useState("");
  const [lossNote, setLossNote] = useState("");

  // Batch selection
  const [selectedDeals, setSelectedDeals] = useState<Set<string>>(new Set());

  // Pipeline customization
  const [pipelineDialogOpen, setPipelineDialogOpen] = useState(false);
  const [editingStages, setEditingStages] = useState<{ id?: string; name: string; color: string; win_probability: number; order: number }[]>([]);
  const [savingPipeline, setSavingPipeline] = useState(false);

  /*
   * Listas de configuração e de opções: chaves próprias, compartilhadas com
   * as outras telas. Invalidar negócios não as arrasta junto.
   */
  const pipelines = usePipelinesQuery();
  const stages = useStagesQuery();
  const members = useMembersQuery();
  const contacts = useContactOptionsQuery();
  const companies = useCompanyOptionsQuery();

  /*
   * Só a busca é debouncada, não o objeto `filters` inteiro: atrasar o objeto
   * faria escolher um responsável ou uma data esperar 300ms sem motivo.
   */
  const queryFilters = { ...filters, search: debouncedSearch };

  /*
   * Duas queries, uma por formato de recorte, e só a da visão atual habilitada.
   * Trocar de visão não descarta o que a outra já tinha: são chaves distintas
   * no mesmo cache.
   */
  const kanbanQuery = useDealsQuery(queryFilters, viewMode !== "list");
  const listQuery = useDealsListQuery({ page, filters: queryFilters }, viewMode === "list");
  const ativa = viewMode === "list" ? listQuery : kanbanQuery;
  const loading = ativa.isLoading;
  const totalCount = ativa.count;

  /*
   * O responsável é resolvido aqui, não no join da query: `owner` sai de
   * `profiles`, que já está em cache para os selects. Deixar de fora da query
   * também simplifica o realtime — o patch de cache não precisa remontar
   * relação nenhuma para mudanças de estágio ou status.
   */
  const deals = useMemo(
    () => ativa.data.map((d) => ({ ...d, owner: members.find((m) => m.id === d.owner_id) ?? null })),
    [ativa.data, members],
  );

  useDealsRealtime();

  const { create, update, changeStage, setStatus } = useDealMutation(stages);
  const { bulkDelete, bulkSetStatus } = useDealBulkMutation(stages);

  // Pipeline padrão na primeira carga; a escolha do usuário prevalece depois.
  useEffect(() => {
    if (!pipelines.length) return;
    const padrao = pipelines.find((pl) => pl.is_default) || pipelines[0];
    setSelectedPipeline((prev) => prev || padrao.id);
  }, [pipelines]);

  const openPipelineEditor = () => {
    const current = stages
      .filter((s) => s.pipeline_id === selectedPipeline)
      .sort((a, b) => a.order - b.order)
      .map((s) => ({ id: s.id, name: s.name, color: s.color || "#94a3b8", win_probability: Number(s.win_probability) || 0, order: s.order }));
    setEditingStages(current.length > 0 ? current : [{ name: "", color: "#94a3b8", win_probability: 50, order: 0 }]);
    setPipelineDialogOpen(true);
  };

  const addEditStage = () => {
    setEditingStages([...editingStages, { name: "", color: "#94a3b8", win_probability: 50, order: editingStages.length }]);
  };

  const removeEditStage = (idx: number) => {
    setEditingStages(editingStages.filter((_, i) => i !== idx));
  };

  const updateEditStage = (idx: number, field: string, value: any) => {
    setEditingStages(editingStages.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  const savePipelineStages = async () => {
    if (!orgId || !selectedPipeline) return;
    setSavingPipeline(true);

    // Delete removed stages
    const existingIds = editingStages.filter((s) => s.id).map((s) => s.id!);
    const currentStageIds = stages.filter((s) => s.pipeline_id === selectedPipeline).map((s) => s.id);
    const toDelete = currentStageIds.filter((id) => !existingIds.includes(id));
    if (toDelete.length > 0) {
      await Promise.all(toDelete.map((id) => supabase.from("pipeline_stages").delete().eq("id", id)));
    }

    // Upsert stages
    for (let i = 0; i < editingStages.length; i++) {
      const s = editingStages[i];
      const payload = { name: s.name, color: s.color, win_probability: s.win_probability, order: i, pipeline_id: selectedPipeline, org_id: orgId };
      if (s.id) {
        await supabase.from("pipeline_stages").update(payload).eq("id", s.id);
      } else {
        await supabase.from("pipeline_stages").insert(payload);
      }
    }

    setSavingPipeline(false);
    setPipelineDialogOpen(false);
    toast({ title: "Pipeline atualizado!" });
    // Só os estágios mudaram; os negócios seguem válidos em cache.
    qc.invalidateQueries({ queryKey: ["pipeline_stages", orgId] });
  };

  // Filtro, busca ou troca de visão invalidam a página atual.
  useEffect(() => { setPage(0); }, [debouncedSearch, filters, viewMode]);

  const pipelineStages = stages.filter((s) => s.pipeline_id === selectedPipeline);

  // Apply filters
  /*
   * `deals` já vem filtrado do servidor. Resta só o recorte de pipeline do
   * kanban, que não é filtro de dados e sim da visão: o kanban mostra as
   * colunas do pipeline selecionado.
   */
  const filteredDeals = viewMode === "kanban"
    ? deals.filter((d) => {
        const stageIds = pipelineStages.map((s) => s.id);
        return !(d.stage_id && !stageIds.includes(d.stage_id) && d.status === "open");
      })
    : deals;

  const handleDragEnd = (dealId: string, newStageId: string) => {
    const deal = deals.find((d) => d.id === dealId);
    if (!deal) return;
    /*
     * O update otimista e a reversão vivem na mutation. O toast de erro fica
     * aqui porque é da tela: sem ele o card ficava na coluna nova mesmo com a
     * escrita falhando, e o usuário seguia o dia achando que tinha salvo.
     */
    changeStage.mutate({ deal, stageId: newStageId }, {
      onError: () => toast({
        title: "Não foi possível mover o negócio. Tente novamente.",
        variant: "destructive",
      }),
    });
  };

  const openNew = (stageId?: string) => {
    setEditing(null);
    setPresetStageId(stageId || null);
    setForm({
      title: "", value: 0, currency: "BRL",
      stage_id: stageId || pipelineStages[0]?.id,
      status: "open", probability: 0,
    });
    setSheetOpen(true);
  };

  useEffect(() => {
    if (shouldOpenNew && pipelineStages.length > 0) {
      openNew();
      searchParams.delete("action");
      setSearchParams(searchParams, { replace: true });
    }
  }, [shouldOpenNew, pipelineStages]);

  const openEdit = (deal: Deal) => {
    setEditing(deal);
    setPresetStageId(null);
    setForm(deal);
    setSheetOpen(true);
  };

  const handleSave = () => {
    if (!orgId || !form.title) return;
    const depois = () => {
      setSheetOpen(false);
      toast({ title: editing ? "Negócio atualizado" : "Negócio criado" });
    };
    const aoFalhar = (e: any) =>
      toast({ title: "Erro", description: e.message, variant: "destructive" });

    if (editing) {
      update.mutate({
        deal: editing,
        patch: {
          title: form.title, value: Number(form.value) || 0, currency: form.currency,
          stage_id: form.stage_id, probability: Number(form.probability) || 0,
          close_date: form.close_date, contact_id: form.contact_id || null,
          company_id: form.company_id || null, owner_id: form.owner_id || null,
        },
      }, { onSuccess: depois, onError: aoFalhar });
    } else {
      create.mutate(form, { onSuccess: depois, onError: aoFalhar });
    }
  };
  const markAsWon = (dealId: string) => {
    const deal = deals.find((d) => d.id === dealId);
    if (!deal) return;
    setStatus.mutate({ deal, status: "won" }, {
      onSuccess: () => toast({ title: "Negócio marcado como ganho! 🎉" }),
      onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
    });
  };

  const openLossModal = (dealId: string) => {
    setLossDealId(dealId);
    setLossReason("");
    setLossNote("");
    setLossModalOpen(true);
  };

  const confirmLoss = () => {
    const deal = deals.find((d) => d.id === lossDealId);
    if (!deal) return;
    const reason = lossNote ? `${lossReason}: ${lossNote}` : lossReason;
    setStatus.mutate({ deal, status: "lost", lossReason: reason }, {
      onSuccess: () => {
        setLossModalOpen(false);
        toast({ title: "Negócio marcado como perdido" });
      },
      onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
    });
  };

  /*
   * Passa os negócios inteiros, não os ids: as mutations precisam do estado
   * anterior para o log dizer o que mudou — e, no delete, o que existia,
   * porque depois não há de onde ler.
   */
  const handleBatchAction = (action: "won" | "lost" | "delete") => {
    const alvos = deals.filter((d) => selectedDeals.has(d.id));
    const limpar = (titulo: string) => () => {
      setSelectedDeals(new Set());
      toast({ title: titulo });
    };
    const aoFalhar = (e: any) =>
      toast({ title: "Erro na ação em lote", description: e.message, variant: "destructive" });

    if (action === "delete") {
      bulkDelete.mutate(alvos, {
        onSuccess: limpar(`${alvos.length} negócios excluídos`), onError: aoFalhar,
      });
    } else {
      bulkSetStatus.mutate({ negocios: alvos, status: action }, {
        onSuccess: limpar(
          `${alvos.length} negócios marcados como ${action === "won" ? "ganhos" : "perdidos"}`,
        ),
        onError: aoFalhar,
      });
    }
  };
  if (!orgId) {
    return <div className="py-20 text-center text-muted-foreground">Crie uma organização em Configurações primeiro.</div>;
  }

  const filtroAtivo = !!debouncedSearch
    || Object.entries(filters).some(([campo, valor]) => campo !== "search" && !!valor);

  const openDeals = filteredDeals.filter((d) => d.status === "open");
  const wonDeals = filteredDeals.filter((d) => d.status === "won");
  const lostDeals = filteredDeals.filter((d) => d.status === "lost");

  return (
    <div className="space-y-3">
      {/* Header — Pipedrive-inspired */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg sm:text-xl font-bold tracking-tight">Negócios</h1>

          {/* View mode toggle */}
          <div className="flex rounded-md border border-border bg-muted/50 p-0.5">
            {[
              { mode: "kanban" as const, icon: Kanban, label: "Kanban" },
              { mode: "list" as const, icon: List, label: "Lista" },
              { mode: "forecast" as const, icon: TrendingUp, label: "Previsão" },
            ].map(({ mode, icon: Icon, label }) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                aria-label={`Visualização ${label}`}
                className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
                  viewMode === mode ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" /><span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          <Button onClick={() => openNew()} size="sm" className="gap-1">
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Negócio</span>
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {totalCount} {totalCount === 1 ? "negócio" : "negócios"}
          </span>

          {pipelines.length > 0 && (
            <Select value={selectedPipeline} onValueChange={setSelectedPipeline}>
              <SelectTrigger className="h-8 w-40 text-xs border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pipelines.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          <Button variant="outline" size="icon" className="h-8 w-8" onClick={openPipelineEditor} aria-label="Personalizar pipeline">
            <Settings2 className="h-3.5 w-3.5" />
          </Button>

          <Button variant="outline" size="sm" className="h-8" onClick={() => setShowFilters(!showFilters)} aria-label="Alternar filtros">
            <Filter className="mr-1 h-3 w-3" /><span className="hidden sm:inline">Filtro</span>
          </Button>
        </div>
      </div>

      {/* Search — sempre visível, como em Contatos e Empresas */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por título..."
          className="pl-9"
          value={filters.search || ""}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
        />
      </div>

      {showFilters && (
        <DealsFilters filters={filters} onFiltersChange={setFilters} members={members} />
      )}

      {loading && (viewMode === "list" ? <TableSkeleton rows={8} cols={6} /> : <CardSkeleton count={8} />)}

      {/*
        Conta sem nenhum negócio troca as três visualizações por um convite a
        criar o primeiro — um kanban de colunas vazias não explica o que fazer.

        O discriminador é o filtro ativo, não `deals.length`: desde que a busca
        foi para o servidor, `deals` É a lista já filtrada, então testar o
        tamanho dela dava sempre o primeiro caso — quem buscava um título
        inexistente via "Nenhum negócio ainda" com botão de criar, como se o
        pipeline estivesse vazio. Mesmo defeito de Contatos e Empresas.
      */}
      {!loading && deals.length === 0 && !filtroAtivo && (
        <EmptyState
          icon={<Handshake className="h-7 w-7 text-muted-foreground" />}
          title="Nenhum negócio ainda"
          description="Negócios são as oportunidades que você acompanha pelo pipeline até fechar."
          actionLabel="Criar negócio"
          onAction={() => openNew()}
        />
      )}

      {!loading && deals.length === 0 && filtroAtivo && (
        <EmptyState
          icon={<Search className="h-7 w-7 text-muted-foreground" />}
          title="Nenhum negócio encontrado"
          description="Nenhum negócio corresponde à busca ou aos filtros aplicados."
        />
      )}

      {!loading && deals.length > 0 && viewMode === "kanban" && (
        <DealsKanban
          deals={openDeals}
          wonDeals={wonDeals}
          lostDeals={lostDeals}
          stages={pipelineStages}
          onDragEnd={handleDragEnd}
          onDealClick={(d) => navigate(`/deals/${d.id}`)}
          onAddDeal={openNew}
          onMarkWon={markAsWon}
          onMarkLost={openLossModal}
        />
      )}

      {!loading && deals.length > 0 && viewMode === "list" && (
        <>
          <DealsList
            deals={filteredDeals}
            stages={stages}
            selectedDeals={selectedDeals}
            onSelectionChange={setSelectedDeals}
            onDealClick={(d) => navigate(`/deals/${d.id}`)}
            onBatchAction={handleBatchAction}
          />
          {/* Paginação só existe na lista — ver o comentário em fetchData. */}
          {totalCount > DEALS_PAGE_SIZE && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-sm text-muted-foreground">
                Página {page + 1} de {Math.ceil(totalCount / DEALS_PAGE_SIZE)} · {totalCount} negócios
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= Math.ceil(totalCount / DEALS_PAGE_SIZE) - 1}
                  onClick={() => setPage(page + 1)}
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {!loading && deals.length > 0 && viewMode === "forecast" && (
        <DealsForecast deals={openDeals} stages={pipelineStages} />
      )}

      {/* Create/Edit Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing ? "Editar Negócio" : "Novo Negócio"}</SheetTitle>
            <SheetDescription>{editing ? "Atualize os dados do negócio" : "Preencha os dados do novo negócio"}</SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label>Título</Label>
              <Input value={form.title || ""} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Nome do negócio" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Valor</Label>
                <Input type="number" value={form.value ?? ""} onChange={(e) => setForm({ ...form, value: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>Moeda</Label>
                <Select value={form.currency || "BRL"} onValueChange={(v) => setForm({ ...form, currency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BRL">BRL (R$)</SelectItem>
                    <SelectItem value="USD">USD ($)</SelectItem>
                    <SelectItem value="EUR">EUR (€)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Estágio</Label>
              <Select value={form.stage_id || ""} onValueChange={(v) => setForm({ ...form, stage_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {pipelineStages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Contato</Label>
              <Select value={form.contact_id || "none"} onValueChange={(v) => setForm({ ...form, contact_id: v === "none" ? null : v })}>
                <SelectTrigger><SelectValue placeholder="Selecionar contato" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {contacts.map((c) => <SelectItem key={c.id} value={c.id}>{c.first_name} {c.last_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Empresa</Label>
              <Select value={form.company_id || "none"} onValueChange={(v) => setForm({ ...form, company_id: v === "none" ? null : v })}>
                <SelectTrigger><SelectValue placeholder="Selecionar empresa" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Responsável</Label>
              <Select value={form.owner_id || "none"} onValueChange={(v) => setForm({ ...form, owner_id: v === "none" ? null : v })}>
                <SelectTrigger><SelectValue placeholder="Selecionar responsável" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name || m.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Probabilidade (%)</Label>
                <Input type="number" min={0} max={100} value={form.probability ?? ""} onChange={(e) => setForm({ ...form, probability: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>Fechamento</Label>
                <Input type="date" value={form.close_date || ""} onChange={(e) => setForm({ ...form, close_date: e.target.value })} />
              </div>
            </div>
            <Button onClick={handleSave} disabled={create.isPending || update.isPending} className="w-full">
              {create.isPending || update.isPending ? "Salvando..." : editing ? "Salvar" : "Criar Negócio"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Loss Reason Modal */}
      <Dialog open={lossModalOpen} onOpenChange={setLossModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Motivo da Perda</DialogTitle>
            <DialogDescription>Por que este negócio foi perdido?</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Motivo</Label>
              <Select value={lossReason} onValueChange={setLossReason}>
                <SelectTrigger><SelectValue placeholder="Selecionar motivo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Preço">Preço muito alto</SelectItem>
                  <SelectItem value="Concorrência">Perdeu para concorrência</SelectItem>
                  <SelectItem value="Timing">Timing inadequado</SelectItem>
                  <SelectItem value="Budget">Sem orçamento</SelectItem>
                  <SelectItem value="Fit">Produto não atende</SelectItem>
                  <SelectItem value="Sem resposta">Sem resposta do cliente</SelectItem>
                  <SelectItem value="Outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Observação (opcional)</Label>
              <Textarea value={lossNote} onChange={(e) => setLossNote(e.target.value)} placeholder="Detalhes adicionais..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLossModalOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmLoss} disabled={!lossReason}>Confirmar Perda</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pipeline Customization Dialog */}
      <Dialog open={pipelineDialogOpen} onOpenChange={setPipelineDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Personalizar Pipeline</DialogTitle>
            <DialogDescription>Edite os estágios do seu pipeline de vendas</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {editingStages.map((stage, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="color"
                  value={stage.color}
                  onChange={(e) => updateEditStage(idx, "color", e.target.value)}
                  className="h-8 w-8 cursor-pointer rounded border-0 shrink-0"
                  aria-label={`Cor do estágio ${idx + 1}`}
                />
                <Input
                  value={stage.name}
                  onChange={(e) => updateEditStage(idx, "name", e.target.value)}
                  placeholder={`Estágio ${idx + 1}`}
                  className="flex-1"
                />
                <div className="flex items-center gap-1 shrink-0">
                  <Input
                    type="number" min={0} max={100}
                    value={stage.win_probability}
                    onChange={(e) => updateEditStage(idx, "win_probability", Number(e.target.value))}
                    className="w-16 text-xs text-center"
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
                {editingStages.length > 1 && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeEditStage(idx)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addEditStage}>
              <Plus className="mr-1 h-3.5 w-3.5" />Adicionar estágio
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPipelineDialogOpen(false)}>Cancelar</Button>
            <Button onClick={savePipelineStages} disabled={savingPipeline || editingStages.some((s) => !s.name.trim())}>
              {savingPipeline && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
