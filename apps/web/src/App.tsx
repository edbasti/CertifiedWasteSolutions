import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { homePath } from "@cws/shared";
import { DayPage } from "./DayPage";
import { LogPage } from "./LogPage";
import { HomePage } from "./HomePage";
import { LoginPage } from "./LoginPage";
import { PortalPage } from "./PortalPage";
import { RequireAuth, useSession } from "./session";
import { StopPage } from "./StopPage";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/day"
          element={
            <RequireAuth roles={["driver"]}>
              <DayPage />
            </RequireAuth>
          }
        />
        <Route
          path="/day/stop/:stopId"
          element={
            <RequireAuth roles={["driver"]}>
              <StopPage />
            </RequireAuth>
          }
        />
        <Route
          path="/log"
          element={
            <RequireAuth roles={["driver"]}>
              <LogPage />
            </RequireAuth>
          }
        />
        <Route
          path="/portal"
          element={
            <RequireAuth roles={["admin", "manager"]}>
              <PortalPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<HomeRedirect />} />
      </Routes>
    </BrowserRouter>
  );
}

function HomeRedirect() {
  const { user, loading } = useSession();
  if (loading) {
    return <p className="pending">Loading…</p>;
  }
  return <Navigate to={user ? homePath(user.role) : "/login"} replace />;
}
