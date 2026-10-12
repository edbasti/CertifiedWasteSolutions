/* The session hook lives next to the provider that owns its context. */
/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Navigate } from "react-router";
import { homePath, type PublicUser, type UserRole } from "@cws/shared";
import { ApiError, currentUser, loginRequest, logoutRequest } from "./api";

type SessionValue = {
  user: PublicUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<string | null>;
  logout: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    currentUser()
      .then((next) => {
        if (active) {
          setUser(next);
        }
      })
      .catch(() => {
        if (active) {
          setUser(null);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  async function login(email: string, password: string) {
    try {
      const result = await loginRequest(email, password);
      setUser(result.user);
      return null;
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Could not sign in.";
      return message;
    }
  }

  async function logout() {
    await logoutRequest();
    setUser(null);
  }

  return <SessionContext.Provider value={{ user, loading, login, logout }}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error("useSession must be used within SessionProvider");
  }
  return value;
}

export function RequireAuth({ roles, children }: { roles: UserRole[]; children: ReactNode }) {
  const { user, loading } = useSession();

  if (loading) {
    return <p className="pending">Loading…</p>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (!roles.includes(user.role)) {
    return <Navigate to={homePath(user.role)} replace />;
  }
  return children;
}
