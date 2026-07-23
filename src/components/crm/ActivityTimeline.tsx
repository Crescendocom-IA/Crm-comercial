import { useEffect, useState, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/crm/EmptyState";
import {
  Plus, Pencil, Trash2, ArrowRight, Upload, Download, LogIn, LogOut, UserPlus, History, Lock,
} from "lucide-react";

type AuditLog = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  user_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
};

type Person = { id: string; name: string | null; email: string | null; avatar_url: string | null };

interface Props {
  entityType: "contact" | "deal" | "company";
  entityId: string;
}

/** Ícone + verbo por ação. O verbo já vem conjugado para colar no nome. */
const ACTIONS: Record<string, { icon: typeof Plus; verb: string; tone: string }> = {
  create: { icon: Plus, verb: "criou", tone: "text-success" },
  update: { icon: Pencil, verb: "atualizou", tone: "text-primary" },
  delete: { icon: Trash2, verb: "excluiu", tone: "text-destructive" },
  import: { icon: Upload, verb: "importou", tone: "text-muted-foreground" },
  export: { icon: Download, verb: "exportou", tone: "text-muted-foreground" },
  login: { icon: LogIn, verb: "entrou", tone: "text-muted-foreground" },
  logout: { icon: LogOut, verb: "saiu", tone: "text-muted-foreground" },
  invite: { icon: UserPlus, verb: "convidou", tone: "text-muted-foreground" },
};

const ENTITY_LABEL: Record<Props["entityType"], string> = {
  contact: "este contato",
  deal: "este negócio",
  company: "esta empresa",
};

/** Campos técnicos que não dizem nada ao usuário no diff. */
const HIDDEN_FIELDS = new Set([
  "id", "org_id", "created_at", "updated_at", "owner_id", "created_by",
]);

const FIELD_LABELS: Record<string, string> = {
  title: "Título", value: "Valor", status: "Status", stage: "Estágio", stage_id: "Estágio",
  probability: "Probabilidade", close_date: "Fechamento", loss_reason: "Motivo da perda",
  first_name: "Nome", last_name: "Sobrenome", email: "Email", phone: "Telefone",
  company_id: "Empresa", lead_score: "Lead score", linkedin_url: "LinkedIn",
};

function label(field: string) {
  return FIELD_LABELS[field] ?? field;
}

function display(v: unknown): string {
  if (v === null || v === undefined || v === "") return "vazio";
  if (typeof v === "boolean") return v ? "sim" : "não";
  return String(v);
}

/**
 * Monta a lista de mudanças comparando old_values com new_values.
 *
 * O schema guarda os dois lados em colunas separadas (old_values/new_values),
 * não um campo `changes` — o diff é derivado aqui.
 */
function diffOf(log: AuditLog): { field: string; from: string; to: string }[] {
  const oldV = log.old_values ?? {};
  const newV = log.new_values ?? {};
  const keys = new Set([...Object.keys(oldV), ...Object.keys(newV)]);
  const out: { field: string; from: string; to: string }[] = [];
  for (const k of keys) {
    if (HIDDEN_FIELDS.has(k)) continue;
    const a = display(oldV[k]);
    const b = display(newV[k]);
    if (a !== b) out.push({ field: k, from: a, to: b });
  }
  return out;
}

export function ActivityTimeline({ entityType, entityId }: Props) {
  const { canManage, loading: roleLoading } = useRole();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [people, setPeople] = useState<Record<string, Person>>({});
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    const { data } = await supabase
      .from("audit_logs")
      .select("id, action, entity_type, entity_id, user_id, old_values, new_values, created_at")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false })
      .limit(100);

    const rows = (data as AuditLog[]) || [];
    setLogs(rows);

    // Resolve os autores numa consulta só, em vez de uma por linha.
    const ids = [...new Set(rows.map((r) => r.user_id).filter(Boolean))] as string[];
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, name, email, avatar_url")
        .in("id", ids);
      const map: Record<string, Person> = {};
      (profs || []).forEach((p) => { map[(p as Person).id] = p as Person; });
      setPeople(map);
    }
    setLoading(false);
  }, [entityType, entityId]);

  useEffect(() => { void fetchLogs(); }, [fetchLogs]);

  /*
   * A RLS de audit_logs libera SELECT só para owner/admin. Sem esta mensagem, um
   * member veria uma lista vazia e concluiria que não há histórico — quando na
   * verdade ele existe e está apenas fora do alcance dele.
   */
  if (!roleLoading && !canManage) {
    return (
      <EmptyState
        icon={<Lock className="h-7 w-7 text-muted-foreground" />}
        title="Histórico restrito"
        description="Apenas proprietários e administradores da organização podem ver o histórico de alterações."
      />
    );
  }

  if (loading || roleLoading) {
    return (
      <div className="space-y-4" role="status" aria-label="Carregando histórico">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <EmptyState
        icon={<History className="h-7 w-7 text-muted-foreground" />}
        title="Sem histórico ainda"
        description="Alterações neste registro aparecerão aqui, com quem fez e quando."
      />
    );
  }

  return (
    <ol className="space-y-4">
      {logs.map((log, i) => {
        const meta = ACTIONS[log.action] ?? { icon: Pencil, verb: log.action, tone: "text-muted-foreground" };
        const Icon = meta.icon;
        const person = log.user_id ? people[log.user_id] : undefined;
        const who = person?.name || person?.email || "Alguém";
        const changes = log.action === "update" ? diffOf(log) : [];
        const when = new Date(log.created_at);

        return (
          <li key={log.id} className="flex gap-3">
            {/* Trilho: avatar + linha vertical ligando os eventos */}
            <div className="flex flex-col items-center">
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarImage src={person?.avatar_url || ""} />
                <AvatarFallback className="bg-primary/10 text-primary text-xs">
                  {(person?.name || person?.email || "?").charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              {i < logs.length - 1 && <span className="mt-1 w-px flex-1 bg-border" aria-hidden="true" />}
            </div>

            <div className="flex-1 pb-1">
              <p className="text-sm">
                <Icon className={`mr-1 inline h-3.5 w-3.5 ${meta.tone}`} aria-hidden="true" />
                <span className="font-medium">{who}</span>{" "}
                {meta.verb} {ENTITY_LABEL[entityType]}
              </p>
              <time
                className="text-xs text-muted-foreground"
                dateTime={log.created_at}
                title={when.toLocaleString("pt-BR")}
              >
                {formatDistanceToNow(when, { addSuffix: true, locale: ptBR })}
              </time>

              {changes.length > 0 && (
                <ul className="mt-1.5 space-y-0.5">
                  {changes.map((c) => (
                    <li key={c.field} className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{label(c.field)}:</span>
                      <span className="line-through">{c.from}</span>
                      <ArrowRight className="h-3 w-3" aria-hidden="true" />
                      <span className="text-foreground">{c.to}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
