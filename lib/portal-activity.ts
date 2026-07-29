export type FavoriteRecord = {
  active: boolean;
  updatedAt: number;
  ownerId?: string;
  name?: string;
  description?: string;
  href?: string;
};

export type PortalActivity = {
  version: 1;
  favorites: Record<string, FavoriteRecord>;
  runCounts: Record<string, number>;
};

const STORAGE_KEY = "clavisflow.portal-activity.v1";
const CHANGE_EVENT = "clavisflow:portal-activity";
const EMPTY_ACTIVITY: PortalActivity = { version: 1, favorites: {}, runCounts: {} };
let cachedActivity: PortalActivity | undefined;

function normalize(value: unknown): PortalActivity {
  if (!value || typeof value !== "object") return EMPTY_ACTIVITY;
  const candidate = value as Partial<PortalActivity>;
  const favorites: Record<string, FavoriteRecord> = {};
  const runCounts: Record<string, number> = {};

  for (const [key, record] of Object.entries(candidate.favorites ?? {})) {
    if (!record || typeof record !== "object") continue;
    const favorite = record as Partial<FavoriteRecord>;
    if (typeof favorite.active === "boolean" && Number.isFinite(favorite.updatedAt)) {
      favorites[key] = {
        active: favorite.active,
        updatedAt: Number(favorite.updatedAt),
        ownerId: typeof favorite.ownerId === "string" ? favorite.ownerId : undefined,
        name: typeof favorite.name === "string" ? favorite.name : undefined,
        description: typeof favorite.description === "string" ? favorite.description : undefined,
        href: typeof favorite.href === "string" ? favorite.href : undefined,
      };
    }
  }
  for (const [key, count] of Object.entries(candidate.runCounts ?? {})) {
    if (Number.isSafeInteger(count) && count >= 0) runCounts[key] = count;
  }
  return { version: 1, favorites, runCounts };
}

function readActivity(): PortalActivity {
  if (cachedActivity) return cachedActivity;
  if (typeof window === "undefined") return EMPTY_ACTIVITY;
  try {
    cachedActivity = normalize(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null"));
  } catch {
    cachedActivity = EMPTY_ACTIVITY;
  }
  return cachedActivity;
}

function writeActivity(next: PortalActivity) {
  cachedActivity = next;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function getPortalActivitySnapshot() {
  return readActivity();
}

export function getPortalActivityServerSnapshot() {
  return EMPTY_ACTIVITY;
}

export function subscribePortalActivity(listener: () => void) {
  if (typeof window === "undefined") return () => undefined;
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    cachedActivity = undefined;
    listener();
  };
  const onChange = () => listener();
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export function toggleFavorite(processKey: string, metadata?: Pick<FavoriteRecord, "name" | "description" | "href">, ownerId?: string) {
  const current = readActivity();
  const active = !current.favorites[processKey]?.active;
  writeActivity({
    ...current,
    favorites: {
      ...current.favorites,
      [processKey]: { ...current.favorites[processKey], ...metadata, active, updatedAt: Date.now(), ownerId },
    },
  });
  return active;
}

export function recordSuccessfulRun(processKey: string) {
  const current = readActivity();
  writeActivity({
    ...current,
    runCounts: {
      ...current.runCounts,
      [processKey]: (current.runCounts[processKey] ?? 0) + 1,
    },
  });
}

export function mergeFavoriteRecords(
  local: Record<string, FavoriteRecord>,
  remote: Record<string, FavoriteRecord>,
) {
  const merged = { ...local };
  for (const [key, remoteRecord] of Object.entries(remote)) {
    const localRecord = merged[key];
    if (!localRecord || remoteRecord.updatedAt > localRecord.updatedAt) merged[key] = remoteRecord;
  }
  return merged;
}

export function mergeRemoteFavoriteRecords(remote: Record<string, FavoriteRecord>, ownerId: string) {
  const current = readActivity();
  const scopedLocal = Object.fromEntries(Object.entries(current.favorites).filter(([, favorite]) => !favorite.ownerId || favorite.ownerId === ownerId));
  const ownedRemote = Object.fromEntries(Object.entries(remote).map(([key, favorite]) => [key, { ...favorite, ownerId }]));
  const favorites = mergeFavoriteRecords(scopedLocal, ownedRemote);
  for (const key of Object.keys(ownedRemote)) favorites[key] = { ...favorites[key], ownerId };
  writeActivity({ ...current, favorites });
  return favorites;
}

export function retainFavoriteRecordsForOwner(ownerId?: string) {
  const current = readActivity();
  const favorites = Object.fromEntries(Object.entries(current.favorites).filter(([, favorite]) => favorite.ownerId === ownerId));
  if (Object.keys(favorites).length === Object.keys(current.favorites).length) return favorites;
  writeActivity({ ...current, favorites });
  return favorites;
}
