import { useState, useMemo } from "react";
import { ConfirmDeleteDialog } from "@/components/crm/ConfirmDeleteDialog";
import DOMPurify from "dompurify";
import { useInboxQuery, useEmailMutation, type Email } from "@/hooks/queries/useEmails";
import { useContactOptionsQuery, type ContactOption } from "@/hooks/queries/useOrgOptions";
import { useOrg } from "@/hooks/useOrg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Mail, Search, Filter, Star, Archive, Clock, MailOpen, Send,
  Reply, ChevronLeft, Inbox as InboxIcon, X, Eye, MousePointerClick,
  RefreshCw, Paperclip, MoreHorizontal, Trash2, SendHorizonal,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { EmailComposeModal } from "@/components/crm/EmailComposeModal";

type Contact = ContactOption;

type FilterMode = "all" | "unread" | "no_owner" | "needs_reply";
type TabMode = "inbox" | "sent";

export default function Inbox() {
  const { orgId } = useOrg();
  const { toast } = useToast();

  const { emails } = useInboxQuery();
  const contacts = useContactOptionsQuery();
  const { markRead: markReadMut, archive, snooze, remove, reply, bulkArchive, invalidar } = useEmailMutation();
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<TabMode>("inbox");

  const contactMap = useMemo(() => {
    const m = new Map<string, Contact>();
    contacts.forEach((c) => { if (c.email) m.set(c.email.toLowerCase(), c); if (c.id) m.set(c.id, c); });
    return m;
  }, [contacts]);

  const getContactForEmail = (email: Email) => {
    if (email.contact_id) return contactMap.get(email.contact_id);
    const addr = email.direction === "inbound" ? email.from_email : (email.to_emails as string[])?.[0];
    if (addr) return contactMap.get(addr.toLowerCase());
    return undefined;
  };

  const filtered = useMemo(() => {
    let list = emails.filter((e) => !e.is_archived);
    // Tab filter
    if (activeTab === "inbox") {
      list = list.filter((e) => e.direction === "inbound");
    } else {
      list = list.filter((e) => e.direction === "outbound");
    }
    if (activeTab === "inbox") {
      if (filterMode === "unread") list = list.filter((e) => !e.is_read);
      if (filterMode === "needs_reply") list = list.filter((e) => e.direction === "inbound" && !e.is_read);
      if (filterMode === "no_owner") list = list.filter((e) => {
        const c = getContactForEmail(e);
        return c && !c.status;
      });
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((e) =>
        e.subject?.toLowerCase().includes(q) ||
        e.from_email?.toLowerCase().includes(q) ||
        (e.to_emails as string[])?.some((t: string) => t.toLowerCase().includes(q))
      );
    }
    return list;
  }, [emails, filterMode, search, contactMap, activeTab]);

  const markRead = (id: string) => markReadMut.mutate(id);

  const archiveEmail = (id: string) =>
    archive.mutate(id, { onSuccess: () => {
      if (selectedEmail?.id === id) setSelectedEmail(null);
      toast({ title: "Email arquivado" });
    } });

  const snoozeEmail = (id: string, hours: number) =>
    snooze.mutate({ id, hours }, { onSuccess: () => toast({ title: `Snooze por ${hours}h` }) });

  const deleteEmail = (id: string) =>
    remove.mutate(id, { onSuccess: () => {
      if (selectedEmail?.id === id) setSelectedEmail(null);
      toast({ title: "Email excluído" });
    } });

  const sendReply = () => {
    if (!selectedEmail || !replyBody.trim()) return;
    reply.mutate({ email: selectedEmail, body: replyBody }, {
      onSuccess: () => { setReplyBody(""); toast({ title: "Resposta enviada" }); },
      onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
    });
  };

  const batchArchive = () => {
    bulkArchive.mutate(Array.from(selectedIds), {
      onSuccess: (n) => { setSelectedIds(new Set()); toast({ title: `${n} emails arquivados` }); },
    });
  };

  const timeAgo = (d: string | null) => {
    if (!d) return "";
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `${days}d`;
  };

  const unreadCount = emails.filter((e) => !e.is_read && !e.is_archived).length;

  if (!orgId) return <div className="py-20 text-center text-muted-foreground">Crie uma organização em Configurações primeiro.</div>;

  return (
    <div className="flex h-[calc(100vh-80px)] gap-0 -m-6">
      {/* Left panel - email list */}
      <div className={`flex flex-col border-r border-border ${selectedEmail ? "w-[420px]" : "flex-1"} shrink-0`}>
        {/* Header */}
        <div className="p-4 border-b border-border space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <InboxIcon className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-bold">Email</h1>
              {unreadCount > 0 && <Badge variant="destructive" className="text-xs px-1.5">{unreadCount}</Badge>}
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={invalidar}><RefreshCw className="h-3.5 w-3.5" /></Button>
              <Button size="sm" onClick={() => setComposeOpen(true)}><Send className="mr-1.5 h-3.5 w-3.5" />Compor</Button>
            </div>
          </div>
          <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as TabMode); setSelectedEmail(null); setSelectedIds(new Set()); }}>
            <TabsList className="w-full">
              <TabsTrigger value="inbox" className="flex-1 gap-1.5">
                <InboxIcon className="h-3.5 w-3.5" />Caixa de Entrada
                {unreadCount > 0 && <Badge variant="destructive" className="text-xs px-1 py-0 ml-1">{unreadCount}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="sent" className="flex-1 gap-1.5">
                <SendHorizonal className="h-3.5 w-3.5" />Enviados
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Buscar emails..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-sm" />
          </div>
          {activeTab === "inbox" && (
            <div className="flex gap-1">
              {(["all", "unread", "needs_reply", "no_owner"] as FilterMode[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilterMode(f)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${filterMode === f ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {f === "all" ? "Todos" : f === "unread" ? "Não lidos" : f === "needs_reply" ? "Requer resposta" : "Sem dono"}
                </button>
              ))}
            </div>
          )}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">{selectedIds.size} selecionados</span>
              <Button variant="outline" size="sm" className="h-6 text-xs" onClick={batchArchive}><Archive className="mr-1 h-3 w-3" />Arquivar</Button>
            </div>
          )}
        </div>

        {/* Email list */}
        <ScrollArea className="flex-1">
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">Nenhum email encontrado</div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((email) => {
                const contact = getContactForEmail(email);
                const isSelected = selectedEmail?.id === email.id;
                return (
                  <div
                    key={email.id}
                    onClick={() => { setSelectedEmail(email); markRead(email.id); }}
                    className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-accent/30 ${isSelected ? "bg-accent/50" : ""} ${!email.is_read ? "bg-primary/5" : ""}`}
                  >
                    <Checkbox
                      checked={selectedIds.has(email.id)}
                      onCheckedChange={(v) => {
                        const next = new Set(selectedIds);
                        v ? next.add(email.id) : next.delete(email.id);
                        setSelectedIds(next);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`text-sm truncate ${!email.is_read ? "font-semibold" : "font-medium"}`}>
                          {activeTab === "sent"
                            ? `Para: ${(email.to_emails as string[])?.[0] || "Desconhecido"}`
                            : contact ? `${contact.first_name} ${contact.last_name || ""}` : email.from_email || "Desconhecido"}
                        </p>
                        <span className="text-xs text-muted-foreground shrink-0">{timeAgo(email.sent_at || email.created_at)}</span>
                      </div>
                      <p className={`text-xs truncate ${!email.is_read ? "text-foreground" : "text-muted-foreground"}`}>
                        {email.subject || "(sem assunto)"}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {activeTab === "sent" && (
                          <Badge variant="outline" className="text-xs px-1 py-0">Enviado</Badge>
                        )}
                        {activeTab === "inbox" && email.direction === "inbound" && (
                          <Badge variant="outline" className="text-xs px-1 py-0">Recebido</Badge>
                        )}
                        {email.open_count > 0 && (
                          <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                            <Eye className="h-2.5 w-2.5" />{email.open_count}x
                          </span>
                        )}
                        {email.click_count > 0 && (
                          <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                            <MousePointerClick className="h-2.5 w-2.5" />{email.click_count}x
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Right panel - email detail + contact context */}
      {selectedEmail && (
        <div className="flex flex-1 min-w-0">
          {/* Email content */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="p-4 border-b border-border">
              <div className="flex items-center justify-between mb-2">
                <Button variant="ghost" size="sm" onClick={() => setSelectedEmail(null)}>
                  <ChevronLeft className="mr-1 h-4 w-4" />Voltar
                </Button>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => archiveEmail(selectedEmail.id)}>
                    <Archive className="h-3.5 w-3.5" />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm"><Clock className="h-3.5 w-3.5" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => snoozeEmail(selectedEmail.id, 1)}>1 hora</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => snoozeEmail(selectedEmail.id, 4)}>4 horas</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => snoozeEmail(selectedEmail.id, 24)}>Amanhã</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <ConfirmDeleteDialog
                    title="Excluir e-mail?"
                    onConfirm={() => deleteEmail(selectedEmail.id)}
                    trigger={
                      <Button variant="ghost" size="sm">
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    }
                  />
                </div>
              </div>
              <h2 className="text-lg font-semibold">{selectedEmail.subject || "(sem assunto)"}</h2>
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                <span>De: {selectedEmail.from_email}</span>
                <span>→</span>
                <span>Para: {(selectedEmail.to_emails as string[])?.join(", ")}</span>
              </div>
              {(selectedEmail.open_count > 0 || selectedEmail.click_count > 0) && (
                <div className="flex items-center gap-3 mt-2">
                  {selectedEmail.open_count > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      <Eye className="mr-1 h-2.5 w-2.5" />Aberto {selectedEmail.open_count}x
                      {selectedEmail.last_opened_at && ` · ${timeAgo(selectedEmail.last_opened_at)}`}
                    </Badge>
                  )}
                  {selectedEmail.click_count > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      <MousePointerClick className="mr-1 h-2.5 w-2.5" />Clicou {selectedEmail.click_count}x
                    </Badge>
                  )}
                </div>
              )}
            </div>

            <ScrollArea className="flex-1 p-4">
              <div
                className="prose prose-sm max-w-none text-foreground"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selectedEmail.body_html || "<p class='text-muted-foreground'>(sem conteúdo)</p>") }}
              />
            </ScrollArea>

            {/* Reply box */}
            <div className="p-4 border-t border-border space-y-2">
              <Textarea
                placeholder="Escreva sua resposta..."
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                rows={3}
                className="text-sm"
              />
              <div className="flex justify-end">
                <Button onClick={sendReply} disabled={!replyBody.trim()} size="sm">
                  <Reply className="mr-1.5 h-3.5 w-3.5" />Responder
                </Button>
              </div>
            </div>
          </div>

          {/* Contact sidebar */}
          {(() => {
            const contact = getContactForEmail(selectedEmail);
            if (!contact) return null;
            return (
              <div className="w-[260px] border-l border-border p-4 space-y-3 shrink-0 hidden xl:block">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Contato</p>
                <div>
                  <p className="text-sm font-medium">{contact.first_name} {contact.last_name}</p>
                  <p className="text-xs text-muted-foreground">{contact.email}</p>
                </div>
                {contact.status && (
                  <Badge variant="outline" className="text-xs">{contact.status}</Badge>
                )}
              </div>
            );
          })()}
        </div>
      )}

      <EmailComposeModal open={composeOpen} onOpenChange={setComposeOpen} onSent={invalidar} />
    </div>
  );
}
