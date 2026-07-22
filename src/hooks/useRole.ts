import { useAuth } from "@/contexts/AuthContext";
import type { Role } from "@/contexts/AuthContext";

export type { Role };

/**
 * Papel do usuário na organização atual, lido do AuthContext.
 *
 * A fonte de verdade é `user_roles`, não `profiles.role`: é ela que Team.tsx lê
 * e escreve, e é ela que as funções `has_role`/RLS consultam. `profiles.role`
 * existe mas é denormalização de exibição e pode ficar velha.
 *
 * A query acontece UMA vez no AuthContext, junto do profile. Antes este hook
 * disparava a própria consulta, e como 14 componentes o usam, abrir uma tela
 * custava 14 idas ao banco para buscar sempre o mesmo dado. O papel é
 * rebuscado sempre que o profile recarrega (login, refreshProfile, troca de org).
 *
 * IMPORTANTE — este hook esconde botões, não protege dados. O RLS continua
 * autorizando por pertencimento à organização, então qualquer membro que abra
 * o console do navegador consegue chamar supabase.from(...).delete() direto.
 * Isso foi uma decisão explícita para uso interno; se o app passar a ter
 * usuários não confiáveis, a política precisa virar RLS por papel no banco.
 */
export function useRole() {
  const { role, loading } = useAuth();

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
