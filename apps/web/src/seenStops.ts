const prefix = "cws_seen_stops:";

function key(date: string) {
  return `${prefix}${date}`;
}

export function readSeenStops(date: string): Set<string> {
  try {
    const raw = sessionStorage.getItem(key(date));
    if (!raw) {
      return new Set();
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return new Set();
    }
    return new Set(parsed.filter((item): item is string => typeof item === "string"));
  } catch {
    return new Set();
  }
}

export function markStopSeen(date: string, stopId: string) {
  const next = readSeenStops(date);
  next.add(stopId);
  sessionStorage.setItem(key(date), JSON.stringify([...next]));
}

export function isStopArchived(date: string, stopId: string, status: string): boolean {
  if (status === "completed") {
    return true;
  }
  return readSeenStops(date).has(stopId);
}
