import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { authApi } from "../api/endpoints";
import { isUnauthorized } from "../api/client";
import type { User } from "../types/api";

interface AuthState {
  user: User | null;
  loading: boolean;
  error: unknown;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["me"],
    queryFn: () => authApi.me().catch((e) => (isUnauthorized(e) ? null : Promise.reject(e))),
    retry: false,
    staleTime: 5 * 60_000
  });

  const logout = useCallback(async () => {
    await authApi.logout().catch(() => undefined);
    qc.clear();
    qc.setQueryData(["me"], null);
  }, [qc]);

  const value = useMemo<AuthState>(
    () => ({ user: query.data ?? null, loading: query.isLoading, error: query.error, logout }),
    [query.data, query.isLoading, query.error, logout]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
