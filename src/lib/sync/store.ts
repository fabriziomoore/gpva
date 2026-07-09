import { create } from "zustand";

export type SyncPhase = "idle" | "syncing" | "error";

interface SyncState {
  online: boolean;
  phase: SyncPhase;
  pending: number;
  lastSyncAt: number | null;
  lastError: string | null;
  setOnline: (v: boolean) => void;
  setPhase: (p: SyncPhase) => void;
  setPending: (n: number) => void;
  setLastError: (message: string | null) => void;
  markSynced: () => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  online: true,
  phase: "idle",
  pending: 0,
  lastSyncAt: null,
  lastError: null,
  setOnline: (online) => set({ online }),
  setPhase: (phase) => set({ phase }),
  setPending: (pending) => set({ pending }),
  setLastError: (lastError) => set({ lastError }),
  markSynced: () => set({ phase: "idle", pending: 0, lastSyncAt: Date.now(), lastError: null }),
}));