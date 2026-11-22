"use client";

import type { SessionResponse } from "@tourism/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { authApi, ApiError, sessionRefreshedEvent } from "@/lib/api";
import { SignInDialog } from "./sign-in-dialog";

interface AuthContextValue {
  session: SessionResponse | null;
  loading: boolean;
  requireAuth(action?: () => void): boolean;
  openSignIn(): void;
  closeSignIn(): void;
  refresh(): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const queryClient = useQueryClient();
  const sessionQuery = useQuery({ queryKey: ["session"], queryFn: authApi.me, retry: false });
  const session = sessionQuery.error instanceof ApiError && sessionQuery.error.status === 401 ? null : sessionQuery.data ?? null;
  useEffect(() => {
    // Requests made while the access token was expired were answered as a guest (no saved/liked flags).
    const refetchGuestData = () => { void queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] !== "session" }); };
    window.addEventListener(sessionRefreshedEvent, refetchGuestData);
    return () => window.removeEventListener(sessionRefreshedEvent, refetchGuestData);
  }, [queryClient]);
  const refresh = useCallback(async () => { await queryClient.invalidateQueries({ queryKey: ["session"] }); }, [queryClient]);
  const requireAuth = useCallback((action?: () => void) => {
    if (!session) { setDialogOpen(true); return false; }
    action?.();
    return true;
  }, [session]);
  const logout = useCallback(async () => { await authApi.logout(); queryClient.setQueryData(["session"], null); await queryClient.invalidateQueries(); }, [queryClient]);
  const value = useMemo<AuthContextValue>(() => ({ session, loading: sessionQuery.isLoading, requireAuth, openSignIn: () => setDialogOpen(true), closeSignIn: () => setDialogOpen(false), refresh, logout }), [session, sessionQuery.isLoading, requireAuth, refresh, logout]);
  return <AuthContext.Provider value={value}>{children}<SignInDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onSignedIn={refresh} /></AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
