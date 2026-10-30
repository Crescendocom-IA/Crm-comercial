import { useMemo, useRef, useState } from "react";
import {
  Target, Plus, Trash2, Search, Download, Save, ChevronLeft, ChevronRight, Loader2, CheckSquare, Handshake,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/crm/EmptyState";
import { ConfirmDeleteDialog } from "@/components/crm/ConfirmDeleteDialog";
import { TableSkeleton } from "@/components/crm/TableSkeleton";
import { SearchableSelect } from "@/components/crm/SearchableSelect";
import { CustomerPurchasesPanel } from "@/components/crm/CustomerPurchasesPanel";
import { CampaignDialog, type CampaignAction } from "@/components/crm/CampaignDialog";
import { CampaignResults } from "@/components/crm/CampaignResults";
import {
  useAudienceQuery, fetchAudienceAll, useProductGroupsQuery, useSellersQuery, SALES_PAGE_SIZE,
  type AudienceRow, type AudienceSort,
} from "@/hooks/queries/useSales";
import { useSegmentsQuery, useSegmentMutation } from "@/hooks/queries/useLeadScoring";
import { useToast } from "@/hooks/use-toast";
import { useRole } from "@/hooks/useRole";
import {
  emptyFilters, emptyRule, toCsv, toQuery,
  type AudienceFilters, type AudienceRule, type RuleAction,
} from "@/lib/audience";
import { formatBRL, formatDate } from "@/lib/format";
import type { Json } from "@/integrations/supabase/types";

const ACTIONS: Array<{ value: RuleAction; label: string }> = [
  { value: "bought", label: "Comprou" },
  { value: "not_bought", label: "Não comprou" },
  { value: "quoted", label: "Pediu orçamento de" },
  { value: "not_quoted", label: "Não pediu orçamento de" },
];

const PERIODS = [
  { value: "any", label: "Todo o histórico" },
  { value: "1", label: "Último mês" },
  { value: "3", label: "Últimos 3 meses" },
  { value: "6", label: "Últimos 6 meses" },
  { value: "12", label: "Último ano" },
  { value: "24", label: "Últimos 2 anos" },
  { value: "custom", label: "Escolher datas" },
];

/** Público salvo: fica em segments, junto de segmentos e relatórios, por type. */
type SavedAudience = { id: string; name: string; filters: { type?: string; state?: AudienceFilters } };

/**
 * Tela de público-alvo: cruza cadastro e histórico de vendas para achar os
 * clientes certos ("quem comprou mangueira nos últimos 6 meses acima de R$ X").
 * A busca roda no banco (audience_search) — só ao clicar, para não disparar uma
 * consulta pesada a cada tecla.
 */
export default function Audiences() {
  const { toast } = useToast();
  const { canManage } = useRole();
  const [campaignAction, setCampaignAction] = useState<CampaignAction | null>(null);
  const [filters, setFilters] = useState<AudienceFilters>(emptyFilters);
  const [applied, setApplied] = useState<Json | null>(null);
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<AudienceSort>("matched");
  const [openCustomer, setOpenCustomer] = useState<AudienceRow | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [savedId, setSavedId] = useState("none");
  const [exporting, setExporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  const { data: groups = [] } = useProductGroupsQuery();
  const { data: sellers = [] } = useSellersQuery();
  const segments = useSegmentsQuery() as SavedAudience[];
  const { save, remove } = useSegmentMutation();
  const { data, isLoading, isFetching, error } = useAudienceQuery(applied, page, sort);

  const saved = useMemo(() => segments.filter((s) => s.filters?.type === "audience"), [segments]);
  const groupOptions = useMemo(() => groups.map((g) => ({ value: g.codigo_erp, label: g.name })), [groups]);
  const sellerOptions = useMemo(() => sellers.map((v) => ({ value: v.codigo_erp, label: v.name })), [sellers]);
  const sellerName = useMemo(() => new Map(sellers.map((v) => [v.codigo_erp, v.name])), [sellers]);

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / SALES_PAGE_SIZE);
  const hasRules = (applied as { rules?: unknown[] } | null)?.rules?.length;

  const set = <K extends keyof AudienceFilters>(key: K, value: AudienceFilters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));
  const setRule = (i: number, patch: Partial<AudienceRule>) =>
    setFilters((f) => ({ ...f, rules: f.rules.map((r, n) => (n === i ? { ...r, ...patch } : r)) }));

  const showResults = () => {
    // O formulário ocupa a tela toda: leva o usuário até o resultado.
    requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const search = () => { setApplied(toQuery(filters) as Json); setPage(0); showResults(); };

  const loadSaved = (id: string) => {
    setSavedId(id);
    const seg = saved.find((s) => s.id === id);
    if (!seg?.filters.state) return;
    setFilters(seg.filters.state);
    setApplied(toQuery(seg.filters.state) as Json);
    setPage(0);
    showResults();
  };

  const saveAudience = () => {
    const name = saveName.trim();
    if (!name) return;
    save.mutate(
      { name, description: null, filters: { type: "audience", state: filters } as unknown as Json },
      {
        onSuccess: () => { toast({ title: "Público salvo" }); setSaveOpen(false); setSaveName(""); },
        onError: (e: Error) => toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" }),
      },
    );
  };

  const exportCsv = async () => {
    if (!applied) return;
    setExporting(true);
    try {
      const all = await fetchAudienceAll(applied, sort);
      const csv = toCsv(all.map((r) => ({
        Cliente: r.name,
        Tipo: r.customer_kind === "company" ? "Empresa" : "Pessoa",
        "CNPJ/CPF": r.cnpj_cpf,
        Email: r.email,
        Telefone: r.phone,
        Cidade: r.cidade,
        UF: r.estado,
        Vendedor: r.seller_codigo_erp ? sellerName.get(r.seller_codigo_erp) ?? "" : "",
        "Valor no filtro": r.matched_value,
        "Última compra no filtro": r.matched_last_date,
        "Total comprado": r.total_spent,
        Pedidos: r.order_count,
        "Última compra": r.last_order_date,
      })));
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "publico-alvo.csv";
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: `${all.length.toLocaleString("pt-BR")} clientes exportados` });
    } catch (e) {
      toast({ title: "Erro ao exportar", description: (e as Error).message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Público-alvo</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Encontre os clientes certos a partir do histórico de vendas</p>
        </div>
        <div className="flex items-center gap-2">
          <SearchableSelect
            className="h-9 w-56 text-sm"
            value={savedId}
            onChange={loadSaved}
            fixed={[{ value: "none", label: "Públicos salvos…" }]}
            options={saved.map((s) => ({ value: s.id, label: s.name }))}
            searchPlaceholder="Buscar público…"
          />
          {savedId !== "none" && (
            <Button variant="ghost" size="icon" aria-label="Excluir público salvo" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-sm">Histórico de compras</CardTitle>
            {filters.rules.length > 1 && (
              <Select value={filters.match} onValueChange={(v) => set("match", v as AudienceFilters["match"])}>
                <SelectTrigger className="h-8 w-56 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Atender a TODAS as regras</SelectItem>
                  <SelectItem value="any">Atender a QUALQUER regra</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {filters.rules.map((rule, i) => (
            <div key={i} className="rounded-md border border-border p-3">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1">
                  <Label className="text-xs">Cliente que…</Label>
                  <Select value={rule.action} onValueChange={(v) => setRule(i, { action: v as RuleAction })}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ACTIONS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Produto (nome ou código)</Label>
                  <Input className="h-9" placeholder="Ex.: mangueira" value={rule.product} onChange={(e) => setRule(i, { product: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Grupo</Label>
                  <SearchableSelect
                    className="h-9 text-sm"
                    value={rule.group || "all"}
                    onChange={(v) => setRule(i, { group: v === "all" ? "" : v })}
                    fixed={[{ value: "all", label: "Todos os grupos" }]}
                    options={groupOptions}
                    searchPlaceholder="Buscar grupo…"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Marca</Label>
                  <Input className="h-9" placeholder="Ex.: Gates" value={rule.brand} onChange={(e) => setRule(i, { brand: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Período</Label>
                  <Select value={rule.period || "any"} onValueChange={(v) => setRule(i, { period: v === "any" ? "" : v })}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PERIODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {rule.period === "custom" && (
                  <>
                    <div className="space-y-1">
                      <Label className="text-xs">De</Label>
                      <Input type="date" className="h-9" value={rule.from} onChange={(e) => setRule(i, { from: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Até</Label>
                      <Input type="date" className="h-9" value={rule.to} onChange={(e) => setRule(i, { to: e.target.value })} />
                    </div>
                  </>
                )}
                <div className="space-y-1">
                  <Label className="text-xs">Valor mínimo (R$)</Label>
                  <Input type="number" min="0" className="h-9" value={rule.minValue} onChange={(e) => setRule(i, { minValue: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Quantidade mínima</Label>
                  <Input type="number" min="0" className="h-9" value={rule.minQty} onChange={(e) => setRule(i, { minQty: e.target.value })} />
                </div>
              </div>
              {filters.rules.length > 1 && (
                <div className="mt-2 flex justify-end">
                  <Button
                    variant="ghost" size="sm" className="h-7 text-xs"
                    onClick={() => set("rules", filters.rules.filter((_, n) => n !== i))}
                  >
                    <Trash2 className="mr-1 h-3 w-3" />Remover regra
                  </Button>
                </div>
              )}
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => set("rules", [...filters.rules, emptyRule()])}>
            <Plus className="mr-1 h-3.5 w-3.5" />Adicionar regra
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Cadastro e relacionamento</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-xs">Tipo</Label>
              <Select value={filters.kind || "all"} onValueChange={(v) => set("kind", v === "all" ? "" : v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Empresas e pessoas</SelectItem>
                  <SelectItem value="company">Só empresas (CNPJ)</SelectItem>
                  <SelectItem value="contact">Só pessoas (CPF)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Vendedor</Label>
              <SearchableSelect
                className="h-9 text-sm"
                value={filters.seller || "all"}
                onChange={(v) => set("seller", v === "all" ? "" : v)}
                fixed={[{ value: "all", label: "Todos os vendedores" }]}
                options={sellerOptions}
                searchPlaceholder="Buscar vendedor…"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Cidade</Label>
              <Input className="h-9" value={filters.cidade} onChange={(e) => set("cidade", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">UF</Label>
              <Input className="h-9" maxLength={2} value={filters.estado} onChange={(e) => set("estado", e.target.value.toUpperCase())} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Total comprado: mínimo (R$)</Label>
              <Input type="number" min="0" className="h-9" value={filters.minTotal} onChange={(e) => set("minTotal", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Total comprado: máximo (R$)</Label>
              <Input type="number" min="0" className="h-9" value={filters.maxTotal} onChange={(e) => set("maxTotal", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Mínimo de pedidos</Label>
              <Input type="number" min="0" className="h-9" value={filters.minOrders} onChange={(e) => set("minOrders", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Ticket médio mínimo (R$)</Label>
              <Input type="number" min="0" className="h-9" value={filters.minTicket} onChange={(e) => set("minTicket", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Sem comprar há pelo menos (dias)</Label>
              <Input type="number" min="0" className="h-9" value={filters.minDaysSince} onChange={(e) => set("minDaysSince", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Comprou nos últimos (dias)</Label>
              <Input type="number" min="0" className="h-9" value={filters.maxDaysSince} onChange={(e) => set("maxDaysSince", e.target.value)} />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch id="has-email" checked={filters.hasEmail} onCheckedChange={(v) => set("hasEmail", v)} />
              <Label htmlFor="has-email" className="text-sm">Tem e-mail</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="has-phone" checked={filters.hasPhone} onCheckedChange={(v) => set("hasPhone", v)} />
              <Label htmlFor="has-phone" className="text-sm">Tem telefone</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="only-active" checked={filters.onlyActive} onCheckedChange={(v) => set("onlyActive", v)} />
              <Label htmlFor="only-active" className="text-sm">Só clientes ativos</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="has-document" checked={filters.hasDocument} onCheckedChange={(v) => set("hasDocument", v)} />
              <Label htmlFor="has-document" className="text-sm" title="Deixa de fora contas internas do ERP, como CONSUMIDOR e TRANSFERENCIA">
                Só com CNPJ/CPF
              </Label>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={search} disabled={isFetching}>
          {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
          Ver público
        </Button>
        <Button variant="ghost" onClick={() => { setFilters(emptyFilters()); setApplied(null); setSavedId("none"); }}>Limpar</Button>
      </div>

      {error && <p className="text-sm text-destructive">Erro na busca: {(error as Error).message}</p>}

      {applied !== null && (
        <>
          <div ref={resultsRef} className="flex scroll-mt-20 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            {isFetching ? (
              // Sem isto, a primeira busca mostrava "0 clientes" até a resposta chegar.
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />Buscando clientes…
              </p>
            ) : (
              <p className="text-sm">
                <span className="text-lg font-bold">{total.toLocaleString("pt-BR")}</span> clientes
                {hasRules ? <> · <span className="font-semibold">{formatBRL(data?.totalMatchedValue ?? 0)}</span> nas compras do filtro</> : null}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Select value={sort} onValueChange={(v) => { setSort(v as AudienceSort); setPage(0); }}>
                <SelectTrigger className="h-9 w-52 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="matched">Maior valor no filtro</SelectItem>
                  <SelectItem value="total">Maior total comprado</SelectItem>
                  <SelectItem value="recent">Compra mais recente</SelectItem>
                  <SelectItem value="oldest">Mais tempo sem comprar</SelectItem>
                  <SelectItem value="name">Nome</SelectItem>
                </SelectContent>
              </Select>
              {canManage && (
                <>
                  <Button size="sm" onClick={() => setCampaignAction("task")} disabled={isFetching || total === 0}>
                    <CheckSquare className="mr-1 h-3.5 w-3.5" />Criar tarefas
                  </Button>
                  <Button size="sm" onClick={() => setCampaignAction("deal")} disabled={isFetching || total === 0}>
                    <Handshake className="mr-1 h-3.5 w-3.5" />Criar negócios
                  </Button>
                </>
              )}
              <Button variant="outline" size="sm" onClick={() => setSaveOpen(true)}><Save className="mr-1 h-3.5 w-3.5" />Salvar público</Button>
              <Button variant="outline" size="sm" onClick={exportCsv} disabled={exporting || total === 0}>
                {exporting ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1 h-3.5 w-3.5" />}Exportar
              </Button>
            </div>
          </div>

          {isLoading ? <TableSkeleton rows={8} cols={6} /> : (
            <div className="rounded-md border border-border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="hidden lg:table-cell">Contato</TableHead>
                    <TableHead className="hidden md:table-cell">Vendedor</TableHead>
                    {hasRules ? <TableHead className="text-right">No filtro</TableHead> : null}
                    <TableHead className="hidden sm:table-cell text-right">Total comprado</TableHead>
                    <TableHead className="text-right">Última compra</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id} className="cursor-pointer" onClick={() => setOpenCustomer(r)}>
                      <TableCell>
                        <p className="font-medium">{r.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {[r.cidade, r.estado].filter(Boolean).join(" / ") || "—"}
                          <Badge variant="outline" className="ml-2 text-[10px] font-normal">{r.customer_kind === "company" ? "Empresa" : "Pessoa"}</Badge>
                        </p>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell max-w-[200px] text-xs">
                        <p className="truncate">{r.email ?? "—"}</p>
                        <p className="text-muted-foreground">{r.phone ?? ""}</p>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm">
                        {r.seller_codigo_erp ? sellerName.get(r.seller_codigo_erp) ?? "—" : "—"}
                      </TableCell>
                      {hasRules ? (
                        <TableCell className="text-right tabular-nums">
                          <p className="font-medium">{formatBRL(r.matched_value)}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(r.matched_last_date)}</p>
                        </TableCell>
                      ) : null}
                      <TableCell className="hidden sm:table-cell text-right tabular-nums">
                        <p>{formatBRL(r.total_spent)}</p>
                        <p className="text-xs text-muted-foreground">{r.order_count} pedido(s)</p>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <p>{formatDate(r.last_order_date)}</p>
                        {r.days_since_last_order !== null && <p className="text-xs text-muted-foreground">há {r.days_since_last_order} dias</p>}
                      </TableCell>
                    </TableRow>
                  ))}
                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="p-0">
                        <EmptyState
                          icon={<Target className="h-7 w-7 text-muted-foreground" />}
                          title="Nenhum cliente neste público"
                          description="Afrouxe algum critério: aumente o período, reduza o valor mínimo ou troque o produto."
                        />
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Página {page + 1} de {totalPages}</span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" aria-label="Página anterior" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                <Button variant="outline" size="sm" aria-label="Próxima página" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
              </div>
            </div>
          )}
        </>
      )}

      <CampaignResults />

      <CampaignDialog
        action={campaignAction}
        onClose={() => setCampaignAction(null)}
        filters={applied}
        total={total}
        totalMatchedValue={data?.totalMatchedValue ?? 0}
        sample={rows}
      />

      <ConfirmDeleteDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Excluir este público salvo?"
        description="Só o filtro salvo é apagado; nenhum cliente é afetado."
        onConfirm={() => remove.mutate(savedId, { onSuccess: () => { setSavedId("none"); toast({ title: "Público excluído" }); } })}
      />

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Salvar público</DialogTitle>
            <DialogDescription>O público é recalculado sempre que você abrir: clientes novos entram sozinhos.</DialogDescription>
          </DialogHeader>
          <Input placeholder="Ex.: Compradores de mangueira" value={saveName} onChange={(e) => setSaveName(e.target.value)} />
          <Button onClick={saveAudience} disabled={!saveName.trim() || save.isPending}>Salvar</Button>
        </DialogContent>
      </Dialog>

      <Sheet open={!!openCustomer} onOpenChange={(o) => !o && setOpenCustomer(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{openCustomer?.name ?? "Cliente"}</SheetTitle>
            <SheetDescription>
              {[openCustomer?.cidade, openCustomer?.estado].filter(Boolean).join(" / ")}
              {openCustomer?.phone ? ` · ${openCustomer.phone}` : ""}
              {openCustomer?.email ? ` · ${openCustomer.email}` : ""}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            {openCustomer?.codigo_erp
              ? <CustomerPurchasesPanel codigoErp={openCustomer.codigo_erp} customerName={openCustomer.name} />
              : <p className="text-sm text-muted-foreground">Cliente cadastrado no CRM, sem histórico no ERP.</p>}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
