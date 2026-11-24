import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Header } from "./Header";
import { Spinner } from "../ui/Spinner";
import { Button } from "../ui/Button";
import { useAuth } from "../../hooks/useAuth";
import { errorMessage } from "../../api/client";

export function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center text-muted" role="status" aria-label="Loading">
      <Spinner className="size-6" />
    </div>
  );
}

/** Guards every signed-in route; unauthenticated visitors are sent to /login. */
export function AppShell() {
  const { user, loading, error } = useAuth();
  const location = useLocation();

  if (loading) return <FullPageSpinner />;
  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="font-display text-2xl">Can’t reach ReachFlow</p>
        <p className="text-[13px] text-muted">{errorMessage(error)}</p>
        <Button onClick={() => window.location.reload()}>Retry</Button>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-[1240px] px-5 pb-16 pt-8 sm:px-8">
        <Outlet />
      </main>
    </div>
  );
}
