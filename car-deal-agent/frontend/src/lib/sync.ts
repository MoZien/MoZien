// Saved cars, garage and saved searches on every device of an account. The server keeps each item
// with the time it last changed (and a note for deleted ones); this device and the server compare
// what they have and swap only what is newer on either side, the latest change winning.
// The stores stay the app's working copy: everything works offline, and changes go out later.

import { accountScope, garageStore, savedStore, searchesStore, type Store } from "./store";
import { api } from "./api";

type Collection = "saved" | "garage" | "searches";
type Item = { id: string; updatedAt?: string };
interface Entry {
  u: string; // last change
  s: string; // signature of the content we last knew
  d?: boolean; // deleted
}
interface State {
  known: Partial<Record<Collection, Record<string, Entry>>>;
  pending: Partial<Record<Collection, string[]>>; // changes not yet on the server
}
interface RemoteItem {
  id: string;
  updated: string;
  deleted: boolean;
  data: Item | null;
}

const COLLECTIONS: Collection[] = ["saved", "garage", "searches"];
const STORES: Record<Collection, Store<Item[]>> = {
  saved: savedStore as unknown as Store<Item[]>,
  garage: garageStore as unknown as Store<Item[]>,
  searches: searchesStore as unknown as Store<Item[]>,
};
const EPOCH = "1970-01-01T00:00:00.000Z";
const TOMBSTONE_DAYS = 180;
const BATCH_CHARS = 800_000;
const EVERY_MS = 2 * 60_000;

let account: string | null = null;
let state: State = { known: {}, pending: {} };
let applying = false;
let running: Promise<void> | null = null;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let interval: ReturnType<typeof setInterval> | null = null;
const unsubscribe: (() => void)[] = [];
const signatures = new WeakMap<object, string>();

const stateKey = () => `ah.sync@${account}`;

function signature(item: object): string {
  const cached = signatures.get(item);
  if (cached) return cached;
  // FNV-1a over the JSON: cheap, and items that didn't change keep their object (and cached value)
  const text = JSON.stringify(item);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const value = `${(hash >>> 0).toString(36)}.${text.length}`;
  signatures.set(item, value);
  return value;
}

function load() {
  try {
    state = { known: {}, pending: {}, ...JSON.parse(localStorage.getItem(stateKey()) || "{}") };
  } catch {
    state = { known: {}, pending: {} };
  }
}

function save() {
  try {
    localStorage.setItem(stateKey(), JSON.stringify(state));
  } catch {
    /* storage full: the next comparison with the server catches up */
  }
}

/** Notes what changed in a collection since we last looked: new and edited items get the current
 *  time, missing ones a deletion note. On the very first look an item keeps its own time (or a
 *  very old one), so an older copy on this device never overwrites newer data from another. */
function detect(collection: Collection) {
  if (applying || !account || accountScope() !== account) return;
  const first = !state.known[collection];
  const known = (state.known[collection] ??= {});
  const pending = new Set(state.pending[collection] ?? []);
  const now = new Date().toISOString();
  const present = new Set<string>();
  for (const item of STORES[collection].get()) {
    if (!item?.id) continue;
    present.add(item.id);
    const sig = signature(item);
    const entry = known[item.id];
    if (!entry || entry.d || entry.s !== sig) {
      known[item.id] = { u: first && !entry ? item.updatedAt || EPOCH : now, s: sig };
      pending.add(item.id);
    }
  }
  const forgetBefore = new Date(Date.now() - TOMBSTONE_DAYS * 86_400_000).toISOString();
  for (const [id, entry] of Object.entries(known)) {
    if (entry.d) {
      if (entry.u < forgetBefore) delete known[id];
    } else if (!present.has(id)) {
      known[id] = { u: now, s: "", d: true };
      pending.add(id);
    }
  }
  state.pending[collection] = [...pending];
  save();
  if (pending.size) schedulePush();
}

/** Takes what the server has newer, without counting it as a change of this device. */
function apply(collection: Collection, items: RemoteItem[]) {
  if (!items.length) return;
  const known = (state.known[collection] ??= {});
  const byId = new Map(STORES[collection].get().map((item) => [item.id, item]));
  for (const remote of items) {
    if (remote.deleted || !remote.data) {
      byId.delete(remote.id);
      known[remote.id] = { u: remote.updated, s: "", d: true };
    } else {
      byId.set(remote.id, remote.data);
      known[remote.id] = { u: remote.updated, s: signature(remote.data) };
    }
  }
  let list = [...byId.values()];
  if (collection === "saved") list = list.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  applying = true;
  try {
    STORES[collection].set(list);
  } finally {
    applying = false;
  }
  save();
}

async function push(collection: Collection) {
  const mine = account;
  const ids = [...(state.pending[collection] ?? [])];
  if (!mine || !ids.length) return;
  const known = state.known[collection] ?? {};
  const byId = new Map(STORES[collection].get().map((item) => [item.id, item]));
  const sent = new Map<string, string>(); // id -> the change that is now on the server
  let batch: { id: string; updated: string; deleted: boolean; data: Item | null }[] = [];
  let size = 0;
  const flush = async () => {
    if (!batch.length) return;
    await api(`/api/sync/${collection}`, { body: { items: batch } });
    for (const item of batch) sent.set(item.id, item.updated);
    batch = [];
    size = 0;
  };
  for (const id of ids) {
    const entry = known[id];
    if (!entry) {
      sent.set(id, ""); // nothing known about it any more: drop it from the queue
      continue;
    }
    const data = entry.d ? null : byId.get(id) ?? null;
    if (!entry.d && !data) continue; // gone from the store: the next look turns it into a deletion note
    const chars = data ? JSON.stringify(data).length : 50;
    if (batch.length && (batch.length >= 20 || size + chars > BATCH_CHARS)) await flush();
    batch.push({ id, updated: entry.u, deleted: Boolean(entry.d), data });
    size += chars;
  }
  await flush();
  if (account !== mine) return; // signed out or switched meanwhile
  // Done with what the server now has, unless it changed again while we were sending.
  const current = state.known[collection] ?? {};
  state.pending[collection] = (state.pending[collection] ?? []).filter((id) => {
    const change = sent.get(id);
    return change === undefined || (change !== "" && current[id]?.u !== change);
  });
  save();
}

async function reconcile(collection: Collection) {
  const mine = account;
  detect(collection);
  const manifest = Object.fromEntries(Object.entries(state.known[collection] ?? {}).map(([id, entry]) => [id, entry.u]));
  const answer = await api<{ need: string[]; items: RemoteItem[] }>(`/api/sync/${collection}/reconcile`, { body: { manifest } });
  if (account !== mine) return; // signed out or switched meanwhile
  apply(collection, answer.items);
  state.pending[collection] = [...new Set([...(state.pending[collection] ?? []), ...answer.need])];
  await push(collection);
}

function schedulePush() {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    if (!account) return;
    void Promise.all(COLLECTIONS.map((collection) => push(collection))).catch(() => undefined);
  }, 1500);
}

/** One full comparison with the server for every collection (on start, sign-in, app back in front). */
export function syncNow(): Promise<void> {
  if (!account) return Promise.resolve();
  if (running) return running;
  running = (async () => {
    for (const collection of COLLECTIONS) await reconcile(collection);
  })()
    .catch(() => undefined) // offline or the server is waking up: next time
    .finally(() => {
      running = null;
    });
  return running;
}

/** Starts syncing for the signed-in account (or stops, when nobody is signed in or the server has
 *  no accounts). Safe to call on every refresh. */
export function syncFor(accountId: string | null) {
  if (accountId === account) {
    void syncNow();
    return;
  }
  stopSync();
  if (!accountId) return;
  account = accountId;
  load();
  for (const collection of COLLECTIONS) unsubscribe.push(STORES[collection].subscribe(() => detect(collection)));
  interval = setInterval(() => {
    if (document.visibilityState === "visible") void syncNow();
  }, EVERY_MS);
  void syncNow();
}

export function stopSync() {
  unsubscribe.splice(0).forEach((stop) => stop());
  if (interval) clearInterval(interval);
  if (pushTimer) clearTimeout(pushTimer);
  interval = pushTimer = null;
  account = null;
}
