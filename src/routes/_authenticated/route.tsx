import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { isAuthenticated, isLoading, verified } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) navigate({ to: "/login", replace: true });
    else if (verified === false) navigate({ to: "/verify", replace: true });
  }, [isAuthenticated, isLoading, verified, navigate]);

  if (isLoading) {
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!isAuthenticated || verified === false) return null;
  return <Outlet />;
}

