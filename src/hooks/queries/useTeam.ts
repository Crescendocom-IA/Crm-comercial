import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { STALE_TIME } from "./config";
import type { Database } from "@/integrations/supabase/types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type TeamMember = Profile & { role: string };

/*
 * Administração de membros da org. Estas queries a user_roles são as que a
 * Sessão 11 deixou de propósito: aqui é a lista/edição do papel de TODOS os
 * membros, não o "meu papel" — este segue vindo do useRole() no AuthContext.
 *
 * Chaves sob ['team', orgId, ...]. Mudanças de papel/membro invalidam também
 * ['profiles', orgId], que popula os selects de responsável em useOrgOptions —
 * remover um membro tem que sumir da lista de "atribuir a".
 */

export const teamKeys = {
  all: (orgId: string | null | undefined) => ["team", orgId] as const,
  members: (orgId: string | null | undefined) => ["team", orgId, "members"] as const,
  invitations: (orgId: string | null | undefined) => ["team", orgId, "invitations"] as const,
  permissions: (orgId: string | null | undefined) => ["team", orgId, "permissions"] as const,
  teams: (orgId: string | null | undefined) => ["team", orgId, "teams"] as const,
  teamMembers: (orgId: string | null | undefined) => ["team", orgId, "team-members"] as const,
};

/** Membros = profiles com o papel de user_roles anexado. */
export function useTeamMembersQuery() {
  const { orgId } = useOrg();
  const query = useQuery({
    queryKey: teamKeys.members(orgId),
    enabled: !!orgId,
    staleTime: STALE_TIME.list,
    queryFn: async () => {
      const [{ data: profs, error: pe }, { data: roles, error: re }] = await Promise.all([
        supabase.from("profiles").select("*").eq("org_id", orgId!),
        supabase.from("user_roles").select("*").eq("org_id", orgId!),
      ]);
      if (pe) throw pe;
      if (re) throw re;
      return (profs || []).map((p) => ({
        ...p,
        role: (roles || []).find((r: any) => r.user_id === p.id)?.role || "member",
      })) as TeamMember[];
    },
  });
  return { members: query.data ?? [], isLoading: query.isLoading };
}

export function useInvitationsQuery() {
  const { orgId } = useOrg();
  const query = useQuery({
    queryKey: teamKeys.invitations(orgId),
    enabled: !!orgId,
    staleTime: STALE_TIME.list,
    queryFn: async () => {
      const { data, error } = await supabase.from("invitations").select("*")
        .eq("org_id", orgId!).is("accepted_at", null);
      if (error) throw error;
      return (data || []) as any[];
    },
  });
  return query.data ?? [];
}

export function useRolePermissionsQuery() {
  const { orgId } = useOrg();
  const query = useQuery({
    queryKey: teamKeys.permissions(orgId),
    enabled: !!orgId,
    staleTime: STALE_TIME.detail,
    queryFn: async () => {
      const { data, error } = await supabase.from("role_permissions").select("*").eq("org_id", orgId!);
      if (error) throw error;
      return (data || []) as any[];
    },
  });
  return query.data ?? [];
}

export function useTeamsQuery() {
  const { orgId } = useOrg();
  const teams = useQuery({
    queryKey: teamKeys.teams(orgId),
    enabled: !!orgId,
    staleTime: STALE_TIME.detail,
    queryFn: async () => {
      const { data, error } = await supabase.from("teams").select("*").eq("org_id", orgId!);
      if (error) throw error;
      return (data || []) as any[];
    },
  });
  const teamMembers = useQuery({
    queryKey: teamKeys.teamMembers(orgId),
    enabled: !!orgId,
    staleTime: STALE_TIME.detail,
    queryFn: async () => {
      const { data, error } = await supabase.from("team_members").select("*");
      if (error) throw error;
      return (data || []) as any[];
    },
  });
  return { teams: teams.data ?? [], teamMembers: teamMembers.data ?? [] };
}

/* ── Mutações de membros/papéis ───────────────────────────────────────────── */

export function useTeamMutation() {
  const { orgId } = useOrg();
  const qc = useQueryClient();
  const invalidar = () => {
    qc.invalidateQueries({ queryKey: teamKeys.all(orgId) });
    // Selects de responsável (useOrgOptions) leem profiles; um membro removido
    // ou repapelado precisa sumir/mudar lá também.
    qc.invalidateQueries({ queryKey: ["profiles", orgId] });
  };

  const changeRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const { error } = await supabase.from("user_roles")
        .update({ role } as any).eq("user_id", userId).eq("org_id", orgId!);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });

  const removeMember = useMutation({
    mutationFn: async (userId: string) => {
      await supabase.from("user_roles").delete().eq("user_id", userId).eq("org_id", orgId!);
      const { error } = await supabase.from("profiles").update({ org_id: null }).eq("id", userId);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });

  const togglePermission = useMutation({
    mutationFn: async ({ id, role, permission, allowed }: {
      id?: string; role: string; permission: string; allowed: boolean;
    }) => {
      if (id) {
        const { error } = await supabase.from("role_permissions").update({ allowed }).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("role_permissions")
          .insert({ org_id: orgId!, role: role as any, permission, allowed });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: teamKeys.permissions(orgId) }),
  });

  /** Insere o conjunto padrão de permissões numa org que ainda não tem nenhuma. */
  const seedPermissions = useMutation({
    mutationFn: async (rows: any[]) => {
      const { error } = await supabase.from("role_permissions").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: teamKeys.permissions(orgId) }),
  });

  return { changeRole, removeMember, togglePermission, seedPermissions, invalidar };
}

export function useTeamGroupMutation() {
  const { orgId } = useOrg();
  const qc = useQueryClient();
  const invalidar = () => {
    qc.invalidateQueries({ queryKey: teamKeys.teams(orgId) });
    qc.invalidateQueries({ queryKey: teamKeys.teamMembers(orgId) });
  };

  const create = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from("teams").insert({ org_id: orgId!, name } as any);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("teams").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });

  const toggleMember = useMutation({
    mutationFn: async ({ teamId, userId, isMember }: { teamId: string; userId: string; isMember: boolean }) => {
      if (isMember) {
        const { error } = await supabase.from("team_members").delete().eq("team_id", teamId).eq("user_id", userId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("team_members").insert({ team_id: teamId, user_id: userId } as any);
        if (error) throw error;
      }
    },
    onSuccess: invalidar,
  });

  return { create, remove, toggleMember };
}

/* ── Convites ─────────────────────────────────────────────────────────────── */

export function useInvitationMutation() {
  const { orgId } = useOrg();
  const qc = useQueryClient();
  const invalidar = () => qc.invalidateQueries({ queryKey: teamKeys.invitations(orgId) });

  /** Convida via edge function invite-member (envia o magic link). */
  const invite = useMutation({
    mutationFn: async ({ email, role }: { email: string; role: string }) => {
      const res = await supabase.functions.invoke("invite-member", {
        body: { email, role, org_id: orgId },
      });
      const erro = res.data?.error || res.error?.message;
      if (erro) throw new Error(erro);
    },
    onSuccess: invalidar,
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("invitations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });

  return { invite, cancel };
}
