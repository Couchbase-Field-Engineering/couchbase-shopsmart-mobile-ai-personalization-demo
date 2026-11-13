import * as Crypto from 'expo-crypto';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api, ApiError, type LoginResponse } from '../api';
import { createLocalDb } from '../db/engine';
import { EMPTY, type LocalDb, type Snapshot } from '../db/localDb';
import { answerOffline } from '../features/assistant/offline';
import { useAuth } from '../session/AuthContext';
import type { ChatMessage, OrderRequest, SyncState } from '../types';

type Ctx = {
  snap: Snapshot;
  sync: SyncState;
  offline: boolean;
  setOffline: (v: boolean) => void;
  dbLocation: string | null;
  /** Queue a shopper action (offline-first): an `orders` doc in the local DB, pushed by the replicator. */
  request: (tool: string, args: Record<string, unknown>, title: string) => Promise<OrderRequest>;
  /** The cart, held on the phone: sku -> quantity. Starts as the model's smart cart. */
  cart: Record<string, number>;
  cartCount: number;
  setQty: (sku: string, qty: number) => void;
  addToCart: (sku: string, qty?: number) => void;
  clearCart: () => void;
  /** Put the smart cart (the model's selected lines) back in the cart. */
  refillCart: () => void;
  ask: (message: string) => Promise<void>;
  thinking: boolean;
  liveChat: ChatMessage[];
  refresh: () => Promise<void>;
};

const DataContext = createContext<Ctx | null>(null);
export const SESSION_EXPIRED = 'session-expired';
const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { session, renew, expire } = useAuth();
  const dbRef = useRef<LocalDb | null>(null);
  // The app token in use: the stored one until /api/auth/refresh renews it.
  const tokenRef = useRef<string | null>(null);
  const [snap, setSnap] = useState<Snapshot>(EMPTY);
  const [sync, setSync] = useState<SyncState>({ engine: 'preview', status: 'stopped', lastSyncAt: null, pendingPush: 0 });
  const [offline, setOfflineState] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [liveChat, setLiveChat] = useState<ChatMessage[]>([]);
  const [dbLocation, setDbLocation] = useState<string | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const seeded = useRef(false);

  const reload = useCallback(async () => {
    if (dbRef.current) setSnap(await dbRef.current.read());
  }, []);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const db = createLocalDb();
    dbRef.current = db;
    const offs: (() => void)[] = [];
    void (async () => {
      await db.open(session.shopper_id);
      if (cancelled) return;
      setDbLocation(db.location());
      offs.push(db.onChange(() => void reload()));
      offs.push(db.onSyncState(setSync));
      await reload(); // whatever is already on the device renders immediately
      let sg = session.sync_gateway;
      tokenRef.current = session.token;
      try {
        // Fresh app token + Sync Gateway session when there is connectivity
        // (sliding expiry); offline, the stored ones are used.
        const r = await api<Pick<LoginResponse, 'token' | 'sync_gateway'>>('/api/auth/refresh', { token: session.token, method: 'POST', timeoutMs: 6000 });
        sg = r.sync_gateway ?? sg;
        if (r.token) tokenRef.current = r.token;
        await renew({ token: r.token, sync_gateway: r.sync_gateway });
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          // Not "offline": the backend no longer accepts this session.
          await expire();
          return;
        }
        /* offline at launch - fine */
      }
      if (cancelled) return;
      await db.startSync({ token: tokenRef.current ?? session.token, shopperId: session.shopper_id, sg });
    })();
    return () => {
      cancelled = true;
      offs.forEach((f) => f());
      void db.close();
      dbRef.current = null;
      setSnap(EMPTY);
      setLiveChat([]);
      setCart({});
      seeded.current = false;
      setSync((st) => ({ ...st, status: 'stopped', detail: undefined }));
    };
  }, [session, reload, renew, expire]);

  // The sync loop reports a rejected session the same way.
  useEffect(() => {
    if (sync.status === 'error' && sync.detail === SESSION_EXPIRED) void expire();
  }, [sync.status, sync.detail, expire]);

  const setOffline = useCallback((v: boolean) => {
    setOfflineState(v);
    void dbRef.current?.setPaused(v);
  }, []);

  // The first recommendations to arrive fill the cart once: the smart cart is
  // where a shopper starts, and they edit from there.
  useEffect(() => {
    if (seeded.current || !snap.recs) return;
    seeded.current = true;
    setCart(Object.fromEntries(snap.recs.lines.filter((l) => l.selected).map((l) => [l.sku, l.qty])));
  }, [snap.recs]);

  const setQty = useCallback((sku: string, qty: number) => {
    setCart((c) => {
      const next = { ...c };
      if (qty < 1) delete next[sku];
      else next[sku] = Math.min(24, qty);
      return next;
    });
  }, []);
  const addToCart = useCallback((sku: string, qty = 1) => setCart((c) => ({ ...c, [sku]: Math.min(24, (c[sku] ?? 0) + qty) })), []);
  const clearCart = useCallback(() => setCart({}), []);
  const refillCart = useCallback(() => {
    setCart((c) => ({ ...Object.fromEntries((snap.recs?.lines ?? []).filter((l) => l.selected).map((l) => [l.sku, l.qty])), ...c }));
  }, [snap.recs]);

  const request = useCallback(
    async (tool: string, args: Record<string, unknown>, title: string) => {
      if (!session || !dbRef.current) throw new Error('Not signed in');
      const req: OrderRequest = {
        _id: `order::${session.shopper_id}::${Crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
        type: 'request',
        shopper_id: session.shopper_id,
        tool,
        args,
        title,
        status: 'pending',
        created_at: nowIso(),
      };
      await dbRef.current.saveRequest(req);
      await reload();
      return req;
    },
    [session, reload],
  );

  const ask = useCallback(
    async (message: string) => {
      if (!session) return;
      const mine: ChatMessage = { id: `l${Date.now()}`, role: 'shopper', text: message, at: nowIso() };
      setLiveChat((c) => [...c, mine]);
      setThinking(true);
      try {
        if (offline) throw new ApiError('offline', 0);
        const r = await api<any>('/api/assistant', {
          token: tokenRef.current ?? session.token,
          body: { message, session_id: `app-${session.shopper_id}` },
          timeoutMs: 45000,
        });
        setLiveChat((c) => [
          ...c,
          { id: `r${Date.now()}`, role: 'assistant', text: r.reply, at: nowIso(), intent: r.intent, actions: r.actions,
            context: r.context, llm: r.llm, sources: r.sources },
        ]);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          void expire();
          return;
        }
        // No connectivity: answer from Couchbase Lite (context cache, recommendations, FAQ, earlier answers).
        const local = answerOffline(message, snap);
        setLiveChat((c) => [...c, { id: `o${Date.now()}`, role: 'assistant', at: nowIso(), ...local }]);
        void e;
      } finally {
        setThinking(false);
      }
    },
    [session, offline, snap, expire],
  );

  // Distinct items, the same count the Cart, the order title and the confirmation use.
  const cartCount = Object.keys(cart).length;

  return (
    <DataContext.Provider
      value={{ snap, sync, offline, setOffline, dbLocation, request, cart, cartCount, setQty, addToCart, clearCart, refillCart, ask, thinking, liveChat, refresh: reload }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useData(): Ctx {
  const c = useContext(DataContext);
  if (!c) throw new Error('useData outside DataProvider');
  return c;
}
