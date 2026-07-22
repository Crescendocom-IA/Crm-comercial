import { useEffect, useState, useCallback, useRef } from "react";
import { TableSkeleton, CardSkeleton } from "@/components/crm/TableSkeleton";
import { logAudit } from "@/lib/audit";
import { EmptyState } from "@/components/crm/EmptyState";
import { useDebounce } from "@/hooks/useDebounce";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { useAuth } from "@/contexts/AuthContext";
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
import { fireWebhook, fireAutomations } from "@/lib/webhooks";
import { applyScoreEvent } from "@/lib/scoring";
import type { Database } from "@/integrations/supabase/types";

type Deal = Database["public"]["Tables"]["deals"]["Row"];
type Stage = Database["public"]["Tables"]["pipeline_stages"]["Row"];
type Pipeline = Database["public"]["Tables"]["pipelines"]["Row"];
type Contact = Database["public"]["Tables"]["contacts"]["Row"];
type Company = Database["public"]["Tables"]["companies"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type DealStatus = Database["public"]["Enums"]["deal_status"];

export type DealWithRelations = Deal & {
  contact?: Contact | null;
  company?: Company | null;
  owner?: Profile | null;
};

type ViewMode = "kanban" | "list" | "forecast";

const PAGE_SIZE = 50;

export default function Deals() {
  const { orgId } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [deals, setDeals] = useState<DealWithRelations[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [selectedPipeline, setSelectedPipeline] = useState<string>("");
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");
  const [loading, setLoading] = useState(true);
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
  const [totalCount, setTotalCount] = useState(0);

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
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    fetchData();
  };

  /** Busca e filtros na query. */
  const applyDealFilters = useCallback((q: any) => {
    if (debouncedSearch) {
      // Sem .or() aqui: a busca é só por título, então .ilike() direto — e a
      // vírgula do usuário não corre risco de virar sintaxe.
      q = q.ilike("title", `%${debouncedSearch}%`);
    }
    if (filters.ownerId) q = q.eq("owner_id", filters.ownerId);
    if (filters.minValue) q = q.gte("value", filters.minValue);
    if (filters.maxValue) q = q.lte("value", filters.maxValue);
    if (filters.closeDateFrom) q = q.gte("close_date", filters.closeDateFrom);
    if (filters.closeDateTo) q = q.lte("close_date", filters.closeDateTo);
    return q;
  }, [debouncedSearch, filters]);

  const fetchData = useCallback(async () => {
    if (!orgId) return;

    /*
     * Só a LISTA é paginada. Kanban e forecast agrupam e somam por estágio —
     * "página 1 do kanban" não significa nada, e os totais por coluna sairiam
     * errados se só 50 negócios chegassem. Essas duas visões carregam tudo que
     * casa os filtros, o que é inerente ao que elas mostram.
     */
    let dQuery = supabase
      .from("deals")
      .select("*, contact:contacts!deals_contact_id_fkey(*), company:companies!deals_company_id_fkey(*)", { count: "exact" })
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    dQuery = applyDealFilters(dQuery);
    if (viewMode === "list") {
      dQuery = dQuery.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    }

    const [pRes, sRes, dRes, cRes, coRes, mRes] = await Promise.all([
      supabase.from("pipelines").select("*").eq("org_id", orgId).order("is_default", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("pipeline_stages").select("*").eq("org_id", orgId).order("order"),
      dQuery,
      supabase.from("contacts").select("*").eq("org_id", orgId),
      supabase.from("companies").select("*").eq("org_id", orgId),
      supabase.from("profiles").select("*").eq("org_id", orgId),
    ]);
    setPipelines(pRes.data || []);
    setStages(sRes.data || []);
    // Enrich deals with owner profile
    const allMembers = mRes.data || [];
    const enrichedDeals: DealWithRelations[] = (dRes.data || []).map((d: any) => ({
      ...d,
      contact: d.contact || null,
      company: d.company || null,
      owner: allMembers.find((m) => m.id === d.owner_id) || null,
    }));
    setDeals(enrichedDeals);
    setTotalCount(dRes.count ?? enrichedDeals.length);
    setContacts(cRes.data || []);
    setCompanies(coRes.data || []);
    setMembers(allMembers);
    // Escolher o pipeline padrão era a única leitura de selectedPipeline aqui,
    // e era ela que o punha nas deps: cada troca de pipeline (e cada evento de
    // realtime, que dependia de fetchData) refazia as 6 queries. As queries
    // nunca filtraram por pipeline — isso já acontece em estado local, em
    // pipelineStages. Com o setState funcional, fetchData passa a depender só
    // de orgId e fica estável.
    if (pRes.data?.length) {
      const def = pRes.data.find((p) => p.is_default) || pRes.data[0];
      setSelectedPipeline((prev) => prev || def.id);
    }
    setLoading(false);
  }, [orgId, page, viewMode, applyDealFilters]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Filtro, busca ou troca de visão invalidam a página atual.
  useEffect(() => { setPage(0); }, [debouncedSearch, filters, viewMode]);

  /*
   * O payload do realtime traz só as colunas de `deals` — sem os joins de
   * contact/company nem o owner enriquecido. Guardamos as listas já carregadas
   * numa ref para reconstruir as relações sem pôr contacts/companies/members
   * nas deps do canal (o que faria o socket reassinar a cada fetch).
   */
  const lookupsRef = useRef({ contacts, companies, members });
  useEffect(() => {
    lookupsRef.current = { contacts, companies, members };
  }, [contacts, companies, members]);

  // Realtime subscription for deals
  useEffect(() => {
    if (!orgId) return;
    const channel = supabase
      .channel('deals-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'deals', filter: `org_id=eq.${orgId}` },
        (payload) => {
          /*
           * Antes, qualquer evento refazia as 6 queries do fetchData. Como cada
           * arrastar de card no kanban emite um UPDATE, um drag custava um
           * refetch completo do pipeline inteiro.
           *
           * UPDATE é o caminho quente e dá para aplicar direto no state. INSERT
           * ainda refaz o fetch: uma linha criada por outra pessoa pode
           * referenciar um contato ou empresa que não temos em memória.
           */
          if (payload.eventType === "UPDATE") {
            const row = payload.new as Deal;
            setDeals((prev) => {
              const idx = prev.findIndex((d) => d.id === row.id);
              if (idx === -1) return prev;
              const old = prev[idx];
              const { contacts: cs, companies: cos, members: ms } = lookupsRef.current;
              const next = [...prev];
              next[idx] = {
                ...old,
                ...row,
                // Só re-resolve a relação se o FK mudou; senão o objeto que já
                // veio do join continua valendo.
                contact: row.contact_id === old.contact_id ? old.contact : cs.find((c) => c.id === row.contact_id) ?? null,
                company: row.company_id === old.company_id ? old.company : cos.find((c) => c.id === row.company_id) ?? null,
                owner: row.owner_id === old.owner_id ? old.owner : ms.find((m) => m.id === row.owner_id) ?? null,
              };
              return next;
            });
            return;
          }

          if (payload.eventType === "DELETE") {
            const removed = payload.old as { id?: string };
            if (removed?.id) setDeals((prev) => prev.filter((d) => d.id !== removed.id));
            return;
          }

          fetchData();
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [orgId, fetchData]);

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

  const handleDragEnd = async (dealId: string, newStageId: string) => {
    // Guarda o estágio anterior ANTES do update otimista, para poder reverter.
    const previousStageId = deals.find((d) => d.id === dealId)?.stage_id ?? null;

    // Update otimista — mantém o arraste fluido.
    setDeals((prev) => prev.map((d) => d.id === dealId ? { ...d, stage_id: newStageId } : d));

    const { error } = await supabase.from("deals").update({ stage_id: newStageId }).eq("id", dealId);
    if (error) {
      // Sem isto o card ficava na coluna nova mesmo com a escrita falhando, e o
      // usuário seguia o dia inteiro achando que a mudança tinha sido salva.
      setDeals((prev) => prev.map((d) => d.id === dealId ? { ...d, stage_id: previousStageId } : d));
      toast({ title: "Não foi possível mover o negócio. Tente novamente.", variant: "destructive" });
      return;
    }

    fireAutomations(orgId, "deal.stage_changed", { deal_id: dealId, stage_id: newStageId });
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

  const handleSave = async () => {
    if (!orgId || !form.title || isSubmitting) return;
    setIsSubmitting(true);
    try {
      if (editing) {
        const { error } = await supabase.from("deals").update({
          title: form.title, value: Number(form.value) || 0, currency: form.currency,
          stage_id: form.stage_id, probability: Number(form.probability) || 0,
          close_date: form.close_date, contact_id: form.contact_id || null,
          company_id: form.company_id || null, owner_id: form.owner_id || null,
        }).eq("id", editing.id);
        if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
      } else {
        const { data: inserted, error } = await supabase.from("deals").insert({
          org_id: orgId, title: form.title!, value: Number(form.value) || 0,
          currency: form.currency || "BRL", stage_id: form.stage_id,
          probability: Number(form.probability) || 0, close_date: form.close_date,
          status: "open", owner_id: form.owner_id || user?.id,
          contact_id: form.contact_id || null, company_id: form.company_id || null,
        }).select().single();
        if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
        void logAudit({
          orgId, action: "create", entityType: "deal", entityId: inserted?.id,
          newValues: { title: form.title, value: Number(form.value) || 0 },
        });
        fireWebhook(orgId, "deal.created", inserted ?? {});
        if (inserted?.contact_id) applyScoreEvent(orgId, inserted.contact_id, "deal_created");
      }
      setSheetOpen(false);
      fetchData();
      toast({ title: editing ? "Negócio atualizado" : "Negócio criado" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const markAsWon = async (dealId: string) => {
    await supabase.from("deals").update({ status: "won" }).eq("id", dealId);
    fireWebhook(orgId, "deal.won", { deal_id: dealId });
    fireAutomations(orgId, "deal.won", { deal_id: dealId });
    fetchData();
    toast({ title: "Negócio marcado como ganho! 🎉" });
  };

  const openLossModal = (dealId: string) => {
    setLossDealId(dealId);
    setLossReason("");
    setLossNote("");
    setLossModalOpen(true);
  };

  const confirmLoss = async () => {
    if (!lossDealId) return;
    const reason = lossNote ? `${lossReason}: ${lossNote}` : lossReason;
    await supabase.from("deals").update({ status: "lost", loss_reason: reason }).eq("id", lossDealId);
    fireWebhook(orgId, "deal.lost", { deal_id: lossDealId, loss_reason: reason });
    fireAutomations(orgId, "deal.lost", { deal_id: lossDealId, loss_reason: reason });
    setLossModalOpen(false);
    fetchData();
    toast({ title: "Negócio marcado como perdido" });
  };

  const handleBatchAction = async (action: "won" | "lost" | "delete") => {
    const ids = Array.from(selectedDeals);
    if (action === "delete") {
      await Promise.all(ids.map((id) => supabase.from("deals").delete().eq("id", id)));
      toast({ title: `${ids.length} negócios excluídos` });
    } else if (action === "won") {
      await Promise.all(ids.map((id) => supabase.from("deals").update({ status: "won" }).eq("id", id)));
      ids.forEach((id) => { fireWebhook(orgId, "deal.won", { deal_id: id }); fireAutomations(orgId, "deal.won", { deal_id: id }); });
      toast({ title: `${ids.length} negócios marcados como ganhos` });
    } else {
      await Promise.all(ids.map((id) => supabase.from("deals").update({ status: "lost" }).eq("id", id)));
      ids.forEach((id) => { fireWebhook(orgId, "deal.lost", { deal_id: id }); fireAutomations(orgId, "deal.lost", { deal_id: id }); });
      toast({ title: `${ids.length} negócios marcados como perdidos` });
    }
    setSelectedDeals(new Set());
    fetchData();
  };

  if (!orgId) {
    return <div className="py-20 text-center text-muted-foreground">Crie uma organização em Configurações primeiro.</div>;
  }

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
        Quando há negócios mas o filtro não casou, cada visualização mostra o
        próprio vazio, que fala de filtro em vez de oferecer criar.
      */}
      {!loading && deals.length === 0 && (
        <EmptyState
          icon={<Handshake className="h-7 w-7 text-muted-foreground" />}
          title="Nenhum negócio ainda"
          description="Negócios são as oportunidades que você acompanha pelo pipeline até fechar."
          actionLabel="Criar negócio"
          onAction={() => openNew()}
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
          {totalCount > PAGE_SIZE && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-sm text-muted-foreground">
                Página {page + 1} de {Math.ceil(totalCount / PAGE_SIZE)} · {totalCount} negócios
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= Math.ceil(totalCount / PAGE_SIZE) - 1}
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
            <Button onClick={handleSave} disabled={isSubmitting} className="w-full">
              {isSubmitting ? "Salvando..." : editing ? "Salvar" : "Criar Negócio"}
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
