import { useEffect, useState } from "react";
import { ErpBadge } from "@/components/crm/ErpBadge";
import { ActivityTimeline } from "@/components/crm/ActivityTimeline";
import {
  useCompanyQuery, useCompanyRelatedQuery, useCompanyMutation,
} from "@/hooks/queries/useCompanies";
import { useIndustriesQuery } from "@/hooks/queries/useOrgOptions";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Edit2, X, Save, Building2, Globe, Users, DollarSign, Trophy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

type Company = Database["public"]["Tables"]["companies"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];

function formatCurrency(value: number, currency: string = "BRL") {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(value);
}

interface CompanyDrawerProps {
  company: Company | null;
  onClose: () => void;
  members: Profile[];
}

export function CompanyDrawer({ company: linhaDaLista, onClose, members }: CompanyDrawerProps) {
  const { toast } = useToast();
  const { industries } = useIndustriesQuery();

  /*
   * A linha que a lista tem em mãos abre o drawer preenchido, mas quem manda
   * é a query: depois de salvar, a invalidação recarrega este detalhe. Antes
   * o drawer seguia mostrando o snapshot antigo até ser fechado e reaberto.
   */
  const { data: empresaFresca } = useCompanyQuery(linhaDaLista?.id, linhaDaLista);
  const company = empresaFresca ?? linhaDaLista;

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<Company>>({});

  const { contacts, deals, stages } = useCompanyRelatedQuery(company);
  const { update } = useCompanyMutation();

  /*
   * Trocar de empresa reinicia o formulário. A dependência é o id, não o
   * objeto: reagir à `company` inteira descartaria o que o usuário está
   * digitando a cada refetch do detalhe.
   */
  useEffect(() => {
    if (!linhaDaLista) return;
    setForm(linhaDaLista);
    setEditing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhaDaLista?.id]);

  const handleSave = () => {
    if (!company) return;
    const patch = {
      name: form.name, domain: form.domain, industry: form.industry,
      size: form.size, revenue: form.revenue ? Number(form.revenue) : null,
      website: form.website, linkedin_url: form.linkedin_url,
    };
    update.mutate({ company, patch }, {
      onSuccess: () => { setEditing(false); toast({ title: "Empresa atualizada" }); },
      onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
    });
  };

  if (!company) return null;

  const totalDeals = deals.length;
  const totalValue = deals.reduce((s, d) => s + (Number(d.value) || 0), 0);
  const wonDeals = deals.filter((d) => d.status === "won");
  const wonValue = wonDeals.reduce((s, d) => s + (Number(d.value) || 0), 0);

  return (
    <Sheet open={!!company} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[520px] sm:max-w-[520px] overflow-y-auto p-0">
        {/* Header */}
        <div className="border-b border-border p-6">
          <div className="flex items-start gap-4">
            {company.domain ? (
              <img src={`https://logo.clearbit.com/${company.domain}`} alt="" className="h-14 w-14 rounded-lg bg-muted object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            ) : (
              <Avatar className="h-14 w-14"><AvatarFallback className="bg-primary/10 text-primary text-lg"><Building2 className="h-6 w-6" /></AvatarFallback></Avatar>
            )}
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold">{company.name}</h2>
                <ErpBadge syncSource={(company as any).sync_source} />
              </div>
              {company.industry && <p className="text-sm text-muted-foreground">{company.industry}</p>}
              {company.domain && <p className="text-xs text-muted-foreground">{company.domain}</p>}
            </div>
            {/* Só ícone: sem aria-label é anunciado como "botão" e nada mais. */}
            <Button
              variant="outline"
              size="sm"
              aria-label={editing ? "Cancelar edição" : "Editar empresa"}
              onClick={() => setEditing(!editing)}
            >
              {editing ? <X className="h-4 w-4" /> : <Edit2 className="h-4 w-4" />}
            </Button>
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-3 gap-3 mt-4">
            <div className="rounded-lg border border-border p-2.5 text-center">
              <p className="text-lg font-bold">{totalDeals}</p>
              <p className="text-xs text-muted-foreground uppercase">Negócios</p>
            </div>
            <div className="rounded-lg border border-border p-2.5 text-center">
              <p className="text-lg font-bold text-primary">{formatCurrency(totalValue)}</p>
              <p className="text-xs text-muted-foreground uppercase">Valor Total</p>
            </div>
            <div className="rounded-lg border border-border p-2.5 text-center">
              <p className="text-lg font-bold text-success">{formatCurrency(wonValue)}</p>
              <p className="text-xs text-muted-foreground uppercase">Ganhos</p>
            </div>
          </div>
        </div>

        <Tabs defaultValue="overview" className="p-4">
          <TabsList className="w-full">
            <TabsTrigger value="overview" className="flex-1">Visão Geral</TabsTrigger>
            <TabsTrigger value="contacts" className="flex-1">Contatos</TabsTrigger>
            <TabsTrigger value="deals" className="flex-1">Negócios</TabsTrigger>
            <TabsTrigger value="history" className="flex-1">Histórico</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4 space-y-4">
            {editing ? (
              <div className="space-y-3">
                <div className="space-y-1"><Label className="text-xs">Nome</Label>
                  <Input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div className="space-y-1"><Label className="text-xs">Domínio</Label>
                  <Input value={form.domain || ""} onChange={(e) => setForm({ ...form, domain: e.target.value })} /></div>
                <div className="space-y-1"><Label className="text-xs">Indústria</Label>
                  <Select value={form.industry || ""} onValueChange={(v) => setForm({ ...form, industry: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecionar indústria" /></SelectTrigger>
                    <SelectContent>
                      {industries.map((ind) => (
                        <SelectItem key={ind} value={ind}>{ind}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Tamanho</Label>
                  <Select value={form.size || ""} onValueChange={(v) => setForm({ ...form, size: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1-10">1-10</SelectItem>
                      <SelectItem value="11-50">11-50</SelectItem>
                      <SelectItem value="51-200">51-200</SelectItem>
                      <SelectItem value="201-500">201-500</SelectItem>
                      <SelectItem value="500+">500+</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1"><Label className="text-xs">Receita anual</Label>
                  <Input type="number" value={form.revenue ?? ""} onChange={(e) => setForm({ ...form, revenue: e.target.value ? Number(e.target.value) : null })} /></div>
                <div className="space-y-1"><Label className="text-xs">Website</Label>
                  <Input value={form.website || ""} onChange={(e) => setForm({ ...form, website: e.target.value })} /></div>
                <div className="space-y-1"><Label className="text-xs">LinkedIn</Label>
                  <Input value={form.linkedin_url || ""} onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })} /></div>
                <Button onClick={handleSave} disabled={update.isPending} className="w-full">
                  <Save className="mr-2 h-4 w-4" />{update.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {company.website && (
                  <div className="flex items-center gap-3 text-sm">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <a href={company.website.startsWith("http") ? company.website : `https://${company.website}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{company.website}</a>
                  </div>
                )}
                {company.size && (
                  <div className="flex items-center gap-3 text-sm">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span>{company.size} funcionários</span>
                  </div>
                )}
                {company.revenue && (
                  <div className="flex items-center gap-3 text-sm">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <span>Receita: {formatCurrency(Number(company.revenue))}</span>
                  </div>
                )}
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-muted-foreground">Criado em</span>
                  <span>{company.created_at ? new Date(company.created_at).toLocaleDateString("pt-BR") : "—"}</span>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="contacts" className="mt-4 space-y-2">
            {contacts.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-6">Nenhum contato vinculado</p>
            ) : (
              contacts.slice(0, 20).map((c) => (
                <div key={c.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                      {c.first_name[0]}{c.last_name?.[0] || ""}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.first_name} {c.last_name}</p>
                    {c.email && <p className="text-xs text-muted-foreground truncate">{c.email}</p>}
                  </div>
                  {c.title && <span className="text-xs text-muted-foreground">{c.title}</span>}
                </div>
              ))
            )}
          </TabsContent>

          <TabsContent value="deals" className="mt-4 space-y-2">
            {deals.map((d) => {
              const stage = stages.find((s) => s.id === d.stage_id);
              return (
                <Card key={d.id}>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{d.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {stage && <Badge variant="secondary" className="text-xs">{stage.name}</Badge>}
                          <Badge variant="secondary" className={`text-xs ${d.status === "won" ? "bg-success/10 text-success" : d.status === "lost" ? "bg-destructive/10 text-destructive" : ""}`}>
                            {d.status === "open" ? "Aberto" : d.status === "won" ? "Ganho" : "Perdido"}
                          </Badge>
                        </div>
                      </div>
                      <span className="text-sm font-bold text-primary">{formatCurrency(Number(d.value) || 0, d.currency || "BRL")}</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {deals.length === 0 && <p className="text-center text-sm text-muted-foreground py-6">Nenhum negócio</p>}
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <ActivityTimeline entityType="company" entityId={company.id} />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
