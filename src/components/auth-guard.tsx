"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useSupabaseAuth } from "@/lib/auth/supabase-auth";

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated, loading, isHydrated } = useSupabaseAuth();
  const pathname = usePathname();
  const redirectedRef = useRef(false);

  // Pages publiques qui ne nécessitent pas d'authentification
  const publicPaths = ["/sign-in", "/sign-up"];
  const isPublicPath = publicPaths.some((path) => pathname.startsWith(path));

  useEffect(() => {
    // Reset redirection flag when path changes
    redirectedRef.current = false;
  }, [pathname]);

  useEffect(() => {
    // Attendre que l'hydratation soit finie et que le loading soit terminé
    if (!isHydrated || loading) {
      return;
    }

    // Si pas authentifié et sur page protégée -> rediriger vers sign-in
    if (!isAuthenticated && !isPublicPath && !redirectedRef.current) {
      console.log("🔄 AuthGuard: Redirecting to sign-in (not authenticated)");
      redirectedRef.current = true;
      window.location.href = "/sign-in";
      return;
    }

    // Si authentifié et sur page publique -> rediriger vers home (force)
    if (isAuthenticated && isPublicPath && !redirectedRef.current) {
      console.log(
        "🔄 AuthGuard: Redirecting to home (authenticated on public page)",
      );
      redirectedRef.current = true;
      window.location.href = "/";
      return;
    }
  }, [isAuthenticated, isPublicPath, isHydrated, loading]);

  // Pendant l'hydratation ou le chargement initial, afficher un loading
  if (!isHydrated || loading) {
    return (
      <div id="root">
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-zinc-900 via-stone-800 to-slate-900">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
            <p className="text-zinc-400">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  // Toujours afficher le contenu, même pendant les redirections
  // Next.js gère la navigation en arrière-plan
  return <div id="root">{children}</div>;
}
