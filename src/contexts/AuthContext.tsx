import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export type Role = "owner" | "admin" | "member";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  /**
   * Papel do usuário na org do profile. Carregado UMA vez aqui, junto do
   * profile, e distribuído por contexto — antes cada componente que chamava
   * useRole() disparava a própria query em user_roles (14 delas por tela).
   */
  role: Role | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  role: null,
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string) => {
    // Retry loop: profile is created by a DB trigger on signup, so it may not
    // exist yet on the very first auth event. Retry with backoff to cover the gap.
    // Extended to 5 attempts to cover slow triggers post-remix.
    const delays = [0, 200, 500, 1000, 1500];
    let result: Profile | null = null;
    for (let i = 0; i < delays.length; i++) {
      if (delays[i] > 0) {
        await new Promise((r) => setTimeout(r, delays[i]));
      }
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        console.warn("[AuthContext] profile fetch error", error);
      }
      if (data) {
        result = data as Profile;
        break;
      }
    }

    // Last-resort self-repair: if profile still missing after all retries,
    // attempt a direct insert (RLS allows id = auth.uid()). Trigger may have failed.
    if (!result) {
      console.warn("[AuthContext] profile still null after retries; attempting self-repair", userId);
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user?.id === userId) {
        const fallbackName =
          (userData.user.user_metadata as any)?.full_name ||
          (userData.user.user_metadata as any)?.name ||
          (userData.user.email?.split("@")[0] ?? "");
        const { data: inserted } = await supabase
          .from("profiles")
          .insert({
            id: userId,
            email: userData.user.email,
            name: fallbackName,
            onboarding_completed: false,
            onboarding_step: 1,
          } as any)
          .select("*")
          .maybeSingle();
        if (inserted) result = inserted as Profile;
      }
    }

    setProfile(result);

    /*
     * Busca o papel na mesma passada do profile. Como todo caminho que atualiza
     * o profile passa por aqui (login, onAuthStateChange, refreshProfile), o
     * papel acompanha automaticamente — inclusive quando o usuário cria/troca de
     * org, já que o CompanyStep chama refreshProfile() depois.
     */
    let resolvedRole: Role | null = null;
    if (result?.org_id) {
      const { data: roleRow, error: roleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("org_id", result.org_id)
        .maybeSingle();
      if (roleError) {
        console.warn("[AuthContext] role fetch error", roleError);
      }
      // Sem linha em user_roles, o menor privilégio é o padrão certo.
      resolvedRole = (roleRow?.role as Role) ?? "member";
    }
    setRole(resolvedRole);

    // loading só cai depois do papel resolvido: se caísse antes, haveria um
    // instante com loading=false e role=null, e as ações privilegiadas
    // sumiriam para reaparecer logo em seguida.
    setLoading(false);
  }, []);

  useEffect(() => {
    // IMPORTANT: No async/await inside onAuthStateChange to prevent deadlocks
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          // Fetch profile in a separate non-blocking call
          setTimeout(() => {
            void loadProfile(session.user.id);
          }, 0);
        } else {
          setProfile(null);
          setRole(null);
          setLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        void loadProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadProfile]);

  const refreshProfile = async () => {
    if (!user) return;
    await loadProfile(user.id);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setRole(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, profile, role, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}
