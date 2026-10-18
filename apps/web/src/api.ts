import type {
  AppNotification,
  AssignedRoute,
  AssignedStop,
  CustomerAccount,
  DriverAccount,
  DriverDay,
  DriverDaySummary,
  DriverLog,
  ServiceType,
  DriverLogLine,
  CompletedStopReport,
  DispatchImportPreview,
  DispatchImportRow,
  InvoiceRecord,
  LogSummary,
  NetSuiteConnection,
  ImportResult,
  PublicUser,
  RouteImportResult,
  StopSourceInfo,
  StopStatus,
} from "@cws/shared";

export class ApiError extends Error {
  constructor(message: string) {
    super(message);
  }
}

let mutatingCount = 0;
const inflightMutations = new Map<string, Promise<unknown>>();

function setDocumentBusy(active: boolean) {
  if (typeof document === "undefined") {
    return;
  }
  document.documentElement.toggleAttribute("data-api-busy", active);
}

function beginMutation() {
  mutatingCount += 1;
  if (mutatingCount === 1) {
    setDocumentBusy(true);
  }
}

function endMutation() {
  mutatingCount = Math.max(0, mutatingCount - 1);
  if (mutatingCount === 0) {
    setDocumentBusy(false);
  }
}

function isAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return error.name === "AbortError" || error.name === "TimeoutError" || /aborted|timeout/i.test(error.message);
}

type RequestInitWithTimeout = RequestInit & { timeoutMs?: number };

async function request<T>(path: string, init?: RequestInitWithTimeout): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const isMutating = method !== "GET" && method !== "HEAD";
  const { timeoutMs, signal: providedSignal, ...fetchInit } = init ?? {};
  const mutationKey = isMutating
    ? `${method}:${path}:${typeof fetchInit.body === "string" ? fetchInit.body : ""}`
    : "";

  if (mutationKey) {
    const existing = inflightMutations.get(mutationKey);
    if (existing) {
      return existing as Promise<T>;
    }
  }

  const controller = timeoutMs && !providedSignal ? new AbortController() : null;
  const timer = controller ? window.setTimeout(() => controller.abort(), timeoutMs) : 0;
  const signal = providedSignal ?? controller?.signal;

  const run = (async () => {
    if (isMutating) {
      beginMutation();
    }
    try {
      const response = await fetch(path, {
        ...fetchInit,
        credentials: "include",
        signal,
        headers: {
          ...(fetchInit.body && !(fetchInit.body instanceof FormData) ? { "content-type": "application/json" } : {}),
          ...fetchInit.headers,
        },
      });
      const text = await response.text();
      let data: (T & { error?: string }) | undefined;
      if (text) {
        try {
          data = JSON.parse(text) as T & { error?: string };
        } catch {
          throw new ApiError(response.ok ? "Invalid response from the server." : "Something went wrong.");
        }
      }

      if (!response.ok) {
        throw new ApiError(data?.error ?? "Something went wrong.");
      }

      return data as T;
    } catch (error) {
      if (isAbortError(error)) {
        throw new ApiError(
          path === "/api/login"
            ? "Sign-in timed out. Wait a few seconds, then try once."
            : "That request timed out. Wait a moment and try once.",
        );
      }
      throw error;
    } finally {
      if (timer) {
        window.clearTimeout(timer);
      }
      if (isMutating) {
        endMutation();
      }
      if (mutationKey) {
        inflightMutations.delete(mutationKey);
      }
    }
  })();

  if (mutationKey) {
    inflightMutations.set(mutationKey, run);
  }
  return run;
}

export function loginRequest(email: string, password: string) {
  return request<{ user: PublicUser }>("/api/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
    timeoutMs: 25_000,
  });
}

export function logoutRequest() {
  return request<{ ok: true }>("/api/logout", { method: "POST" });
}

export async function currentUser(): Promise<PublicUser | null> {
  const response = await fetch("/api/me", { credentials: "include" });
  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    throw new Error("Could not load the session.");
  }
  const body = (await response.json()) as { user: PublicUser };
  return body.user;
}

export function listDrivers() {
  return request<{ drivers: DriverAccount[] }>("/api/drivers");
}

export function createDriver(input: { name: string; email: string; companyName: string; password: string }) {
  return request<{ driver: DriverAccount }>("/api/drivers", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function resetDriverAccess(driverId: string, password: string) {
  return request<{ ok: true }>(`/api/drivers/${driverId}/reset-access`, {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

export function updateDriver(
  driverId: string,
  input: { name?: string; email?: string; companyName?: string; active?: boolean },
) {
  return request<{ driver: DriverAccount }>(`/api/drivers/${driverId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function importDrivers(csv: string) {
  return request<ImportResult>("/api/drivers/import", {
    method: "POST",
    body: JSON.stringify({ csv }),
  });
}

export function listCustomers() {
  return request<{ customers: CustomerAccount[] }>("/api/customers");
}

export function createCustomer(input: { name: string; address: string }) {
  return request<{ customer: CustomerAccount }>("/api/customers", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateCustomer(
  customerId: string,
  input: { name?: string; address?: string; active?: boolean },
) {
  return request<{ customer: CustomerAccount }>(`/api/customers/${customerId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function importCustomers(csv: string) {
  return request<ImportResult>("/api/customers/import", {
    method: "POST",
    body: JSON.stringify({ csv }),
  });
}

export function listRouteSources() {
  return request<{ sources: StopSourceInfo[] }>("/api/route-sources");
}

export function listRouteDrivers() {
  return request<{ drivers: { id: string; name: string; email: string }[] }>("/api/routes/drivers");
}

export function listRoutes(date: string) {
  return request<{ date: string; routes: AssignedRoute[] }>(`/api/routes?date=${encodeURIComponent(date)}`);
}

export function addRouteStop(input: {
  driverUserId: string;
  serviceDate: string;
  customerId?: string;
  customerName?: string;
  address?: string;
  serviceType: ServiceType;
  quantity: number;
  driverNotes: string;
}) {
  return request<{ stop: AssignedStop }>("/api/routes/stops", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function importRoutes(csv: string) {
  return request<RouteImportResult>("/api/routes/import", {
    method: "POST",
    body: JSON.stringify({ csv }),
  });
}

export function reorderRoute(routeId: string, stopIds: string[]) {
  return request<{ routes: AssignedRoute[] }>(`/api/routes/${routeId}/order`, {
    method: "POST",
    body: JSON.stringify({ stopIds }),
  });
}

export function removeStop(stopId: string) {
  return request<{ ok: true }>(`/api/stops/${stopId}`, { method: "DELETE" });
}

export function listDriverDays() {
  return request<{ days: DriverDaySummary[] }>("/api/day/summary");
}

export function loadDay(date: string) {
  return request<DriverDay>(`/api/day?date=${encodeURIComponent(date)}`);
}

export function reorderDay(date: string, stopIds: string[]) {
  return request<DriverDay>("/api/day/order", {
    method: "POST",
    body: JSON.stringify({ date, stopIds }),
  });
}

export function setStopStatus(stopId: string, status: StopStatus) {
  return request<DriverDay>(`/api/stops/${stopId}/status`, {
    method: "POST",
    body: JSON.stringify({ status }),
  });
}

export function addStopNote(stopId: string, body: string) {
  return request<DriverDay>(`/api/stops/${stopId}/notes`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export function loadLog(date: string) {
  return request<{ log: DriverLog | null }>(`/api/logs?date=${encodeURIComponent(date)}`);
}

export function saveLog(input: {
  serviceDate: string;
  logType: DriverLog["logType"];
  driverCompanyName: string;
  lines: Omit<DriverLogLine, "id" | "sequence">[];
}) {
  return request<{ log: DriverLog }>("/api/logs", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function submitLog(logId: string) {
  return request<{ log: DriverLog }>(`/api/logs/${logId}/submit`, { method: "POST" });
}

export function listLogsForReview() {
  return request<{ logs: LogSummary[] }>("/api/logs/review");
}

export function readLog(logId: string) {
  return request<{ log: DriverLog }>(`/api/logs/${logId}`);
}

export function completeLog(logId: string, paymentDate: string) {
  return request<{ log: DriverLog; invoice: InvoiceRecord }>(`/api/logs/${logId}/complete`, {
    method: "POST",
    body: JSON.stringify({ paymentDate }),
  });
}

export function sendInvoice(invoiceId: string) {
  return request<{ invoice: InvoiceRecord; emailed: boolean }>(`/api/invoices/${invoiceId}/send`, { method: "POST" });
}

export function loadNetSuite() {
  return request<NetSuiteConnection>("/api/netsuite");
}

export async function previewNetSuiteDispatch(file: File) {
  const body = new FormData();
  body.set("file", file);
  return request<DispatchImportPreview>("/api/netsuite/dispatch/preview", {
    method: "POST",
    body,
  });
}

export function importNetSuiteDispatch(rows: DispatchImportRow[], assignments: Record<string, string>) {
  return request<RouteImportResult>("/api/netsuite/dispatch/import", {
    method: "POST",
    body: JSON.stringify({ rows, assignments }),
  });
}

export function exportNetSuiteDispatchUrl(from: string, to: string, format: "csv" | "xlsx") {
  const params = new URLSearchParams({ from, to, format });
  return `/api/netsuite/dispatch/export?${params.toString()}`;
}

export function loadStopReport(filters: { driver: string; customer: string; from: string; to: string }) {
  const params = new URLSearchParams();
  if (filters.driver.trim()) {
    params.set("driver", filters.driver.trim());
  }
  if (filters.customer.trim()) {
    params.set("customer", filters.customer.trim());
  }
  if (filters.from) {
    params.set("from", filters.from);
  }
  if (filters.to) {
    params.set("to", filters.to);
  }
  const query = params.toString();
  return request<CompletedStopReport>(`/api/reports/stops${query ? `?${query}` : ""}`);
}

export function searchInvoices(driver: string, date: string) {
  const params = new URLSearchParams();
  if (driver.trim()) {
    params.set("driver", driver.trim());
  }
  if (date) {
    params.set("date", date);
  }
  const query = params.toString();
  return request<{ invoices: InvoiceRecord[] }>(`/api/invoices${query ? `?${query}` : ""}`);
}

export function correctLog(
  logId: string,
  input: { driverCompanyName: string; paymentDate: string; lines: DriverLogLine[] },
) {
  return request<{ log: DriverLog }>(`/api/logs/${logId}/corrections`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listNotifications() {
  return request<{ notifications: AppNotification[] }>("/api/notifications");
}

export function markNotificationRead(notificationId: string) {
  return request<{ notification: AppNotification }>(`/api/notifications/${notificationId}/read`, { method: "POST" });
}

export function uploadStopPhotos(stopId: string, files: File[]) {
  const body = new FormData();
  for (const file of files) {
    body.append("photos", file);
  }
  return request<DriverDay>(`/api/stops/${stopId}/photos`, { method: "POST", body });
}
