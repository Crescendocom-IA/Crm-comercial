import { useState, useEffect, memo, lazy, Suspense } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { AppHeader } from "./AppHeader";
import { MobileBottomNav } from "./MobileBottomNav";
/**
 * cmdk entra no bundle inteiro por causa do CommandPalette, e o shadcn não faz
 * lazy de nada — o command.tsx importa cmdk estaticamente. Como a paleta só
 * existe depois de ⌘K, ela é carregada sob demanda e só montada quando abre;
 * antes disso o chunk nem é requisitado.
 */
const CommandPalette = lazy(() =>
  import("@/components/CommandPalette").then((m) => ({ default: m.CommandPalette }))
);
import { AICopilot } from "@/components/crm/AICopilot";
import { OnboardingModal } from "@/components/onboarding/OnboardingModal";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";

export function AppLayout() {
  const [searchOpen, setSearchOpen] = useState(false);
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!loading && !user) {
      navigate("/login");
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <AppHeader onOpenSearch={() => setSearchOpen(true)} />
          <main className="flex-1 p-3 sm:p-6 pb-20 md:pb-6">
            <Outlet />
          </main>
        </div>
      </div>
      {isMobile && <MobileBottomNav />}
      {searchOpen && (
        <Suspense fallback={null}>
          <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
        </Suspense>
      )}
      <AICopilot />
      <OnboardingModal />
    </SidebarProvider>
  );
}
