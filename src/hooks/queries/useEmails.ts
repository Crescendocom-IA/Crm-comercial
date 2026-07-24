import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { useAuth } from "@/contexts/AuthContext";
import { STALE_TIME } from "./config";
import type { Database } from "@/integrations/supabase/types";

type Email = Database["public"]["Tables"]["emails"]["Row"];

/*
 * A caixa de entrada carrega os emails da org e filtra em memória (aba
 * inbox/sent, não lido, busca) — não pagina, e o painel de leitura mostra o
 * email SELECIONADO na lista, não um buscado por id. Por isso não há
 * useEmailQuery(id): seria uma hook sem consumidor.
 *
 * As mutações por item (ler, arquivar, snooze, excluir) aplicam direto no
 * cache, sem refetch: markRead dispara a cada clique num email, e um refetch
 * por clique piscaria a lista inteira. Já responder e arquivar em lote
 * invalidam, porque criam/movem linhas que a lista precisa reordenar.
 */

export const emailKeys = {
  all: (orgId: string | null | undefined) => ["emails", orgId] as const,
  list: (orgId: string | null | undefined) => ["emails", orgId, "list"] as const,
};

export function useInboxQuery() {
  const { orgId } = useOrg();
  const query = useQuery({
    queryKey: emailKeys.list(orgId),
    enabled: !!orgId,
    staleTime: STALE_TIME.list,
    queryFn: async () => {
      const { data, error } = await supabase.from("emails").select("*")
        .eq("org_id", orgId!).order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Email[];
    },
  });
  return { emails: query.data ?? [], isLoading: query.isLoading };
}

function patchEmail(qc: QueryClient, orgId: string | null | undefined, id: string, patch: Partial<Email>) {
  qc.setQueryData<Email[]>(emailKeys.list(orgId), (old) =>
    old?.map((e) => (e.id === id ? { ...e, ...patch } : e)));
}

function removeEmail(qc: QueryClient, orgId: string | null | undefined, id: string) {
  qc.setQueryData<Email[]>(emailKeys.list(orgId), (old) => old?.filter((e) => e.id !== id));
}

export function useEmailMutation() {
  const { orgId } = useOrg();
  const { user } = useAuth();
  const qc = useQueryClient();
  const invalidar = () => qc.invalidateQueries({ queryKey: emailKeys.all(orgId) });

  /** Marca como lido. Otimista e sem refetch — roda a cada abertura de email. */
  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("emails").update({ is_read: true } as any).eq("id", id);
      if (error) throw error;
    },
    onMutate: (id) => patchEmail(qc, orgId, id, { is_read: true }),
  });

  const archive = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("emails").update({ is_archived: true } as any).eq("id", id);
      if (error) throw error;
    },
    // A lista esconde arquivados; patch em vez de remover mantém o dado se algo
    // reidratar a query.
    onMutate: (id) => patchEmail(qc, orgId, id, { is_archived: true }),
  });

  const snooze = useMutation({
    mutationFn: async ({ id, hours }: { id: string; hours: number }) => {
      const until = new Date(Date.now() + hours * 3600000).toISOString();
      const { error } = await supabase.from("emails").update({ snoozed_until: until, is_read: true } as any).eq("id", id);
      if (error) throw error;
      return until;
    },
    onMutate: ({ id }) => patchEmail(qc, orgId, id, { is_read: true }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("emails").delete().eq("id", id);
      if (error) throw error;
    },
    onMutate: (id) => removeEmail(qc, orgId, id),
  });

  /** Responde um email inbound criando o outbound na mesma thread. */
  const reply = useMutation({
    mutationFn: async ({ email, body }: { email: Email; body: string }) => {
      const { error } = await supabase.from("emails").insert({
        org_id: orgId!, user_id: user?.id, contact_id: email.contact_id, deal_id: email.deal_id,
        direction: "outbound", subject: `Re: ${email.subject || ""}`, body_html: body,
        from_email: user?.email, to_emails: [email.from_email || ""], status: "sent",
        provider: "manual", sent_at: new Date().toISOString(),
        thread_id: email.thread_id || email.id,
      } as any);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });

  /** Arquiva vários de uma vez — o único caminho em lote da tela. */
  const bulkArchive = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => supabase.from("emails").update({ is_archived: true } as any).eq("id", id)));
      return ids.length;
    },
    onSuccess: invalidar,
  });

  return { markRead, archive, snooze, remove, reply, bulkArchive, invalidar };
}
