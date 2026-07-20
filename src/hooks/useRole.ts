import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/hooks/useOrg";

export type Role = "owner" | "admin" | "member";

/**
 * Papel do usuário na organização atual.
 *
 * A fonte de verdade é `user_roles`, não `profiles.role`: é ela que Team.tsx lê
 * e escreve, e é ela que as funções `has_role`/RLS consultam. `profiles.role`
 * existe mas é denormalização de exibição e pode ficar velha.
 *
 * IMPORTANTE — este hook esconde botões, não protege dados. O RLS continua
 * autorizando por pertencimento à organização, então qualquer membro que abra
 * o console do navegador consegue chamar supabase.from(...).delete() direto.
 * Isso foi uma decisão explícita para uso interno; se o app passar a ter
 * usuários não confiáveis, a política precisa virar RLS por papel no banco.
 */
export function useRole() {
  const { user } = useAuth();
  const { orgId } = useOrg();
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !orgId) {
      setRole(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("org_id", orgId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        // Sem linha em user_roles, o menor privilégio é o padrão certo.
        setRole((data?.role as Role) ?? "member");
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [user, orgId]);

  const isOwner = role === "owner";
  const isAdmin = role === "admin";
  const isMember = role === "member";

  /*
   * Enquanto `role` é null (carregando), todos os booleanos são falsos. A ação
   * privilegiada aparece um instante depois em vez de sumir um instante depois:
   * esconder um botão que a pessoa podia usar é recuperável, mostrar um que ela
   * não podia leva a um clique que falha — ou pior, que funciona.
   */
  return {
    role,
    loading,
    isOwner,
    isAdmin,
    isMember,
    /** Excluir registros, individual ou em lote. */
    canDelete: isOwner || isAdmin,
    /** Automações, pipelines, estágios, campos, membros, integrações. */
    canManage: isOwner || isAdmin,
    /** Alterar o papel de outra pessoa. Só o owner. */
    canManageRoles: isOwner,
    /** Excluir a organização. Só o owner. */
    canDeleteOrg: isOwner,
  };
}
