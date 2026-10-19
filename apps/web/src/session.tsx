/* The session hook lives next to the provider that owns its context. */
/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Navigate } from "react-router";
import { homePath, type PublicUser, type UserRole } from "@cws/shared";
import { ApiError, currentUser, loginRequest, logoutRequest } from "./api";

const signedOutFlag = "cws_signed_out";

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
  const loadGeneration = useRef(0);
  const loginInFlight = useRef<Promise<string | null> | null>(null);
  const logoutInFlight = useRef<Promise<void> | null>(null);

  useEffect(() => {
    let active = true;
    const generation = loadGeneration.current;

    async function restore() {
      if (sessionStorage.getItem(signedOutFlag)) {
        // Never block the login form on a slow/timing-out logout call.
        if (active && generation === loadGeneration.current) {
          setUser(null);
          setLoading(false);
        }
        void logoutRequest()
          .then(() => sessionStorage.removeItem(signedOutFlag))
          .catch(() => {
            // Keep the flag so a later visit can retry clearing the server session.
          });
        return;
      }

      try {
        const next = await currentUser();
        if (active && generation === loadGeneration.current) {
          setUser(next);
        }
      } catch {
        if (active && generation === loadGeneration.current) {
          setUser(null);
        }
      } finally {
        if (active && generation === loadGeneration.current) {
          setLoading(false);
        }
      }
    }

    void restore();
    return () => {
      active = false;
    };
  }, []);

  async function login(email: string, password: string) {
    if (loginInFlight.current) {
      return loginInFlight.current;
    }
    loginInFlight.current = (async () => {
      try {
        const result = await loginRequest(email, password);
        sessionStorage.removeItem(signedOutFlag);
        loadGeneration.current += 1;
        setUser(result.user);
        setLoading(false);
        return null;
      } catch (error) {
        const message = error instanceof ApiError ? error.message : "Could not sign in.";
        return message;
      } finally {
        loginInFlight.current = null;
      }
    })();
    return loginInFlight.current;
  }

  async function logout() {
    if (logoutInFlight.current) {
      return logoutInFlight.current;
    }
    logoutInFlight.current = (async () => {
      // Invalidate any in-flight /api/me so it cannot restore the previous user.
      loadGeneration.current += 1;
      setLoading(false);
      setUser(null);
      sessionStorage.setItem(signedOutFlag, "1");
      // Leave immediately — awaiting /api/logout was freezing the login screen when it timed out.
      if (window.location.pathname !== "/login") {
        window.location.assign("/login");
        return;
      }
      void logoutRequest()
        .then(() => sessionStorage.removeItem(signedOutFlag))
        .catch(() => {
          // Keep the flag so a later visit can retry clearing the server session.
        });
    })().finally(() => {
      logoutInFlight.current = null;
    });
    return logoutInFlight.current;
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
