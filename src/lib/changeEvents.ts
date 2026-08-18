// src/lib/changeEvents.ts
//
// Tells the other windows that tournament data changed.
//
// The TV display and the session dashboard used to find out by reloading
// everything every five seconds — permanent background load on the kind of
// laptop that sits in a sports hall, and still up to five seconds of delay
// before a result appears on the wall (REVIEW-BACKLOG.md E3).
//
// Writes now announce themselves. Tauri's event bus reaches every window of
// the app, which BroadcastChannel does not do reliably across separate
// webviews; the channel stays as the fallback for the browser build, where
// there is no Tauri to ask.

/**
 * Same check as db.ts makes. Duplicated on purpose: importing it would
 * make db.ts and this module import each other, and the check is one
 * property lookup.
 */
function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Event name on the Tauri bus and the BroadcastChannel. */
const CHANNEL = "boss:data-changed";

export interface DataChange {
  /** The tournament whose data changed, when the writer knows it. */
  tournamentId?: number;
  /** Rough kind of change, for listeners that only care about some. */
  kind: "match" | "schedule" | "tournament" | "roster";
}

type Listener = (change: DataChange) => void;

/**
 * In-process listeners. A write and its listener often live in the same
 * window (the tournament view writes, the session banner listens), and
 * neither transport delivers to its own sender.
 */
const localListeners = new Set<Listener>();

let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!channel) channel = new BroadcastChannel(CHANNEL);
  return channel;
}

/**
 * Announces a change to every window, including this one.
 *
 * Never throws: a notification that does not arrive costs freshness, and
 * the polling safety net picks it up. Failing the write that triggered it
 * would be the worse trade.
 */
export async function notifyDataChanged(change: DataChange): Promise<void> {
  for (const listener of localListeners) {
    try {
      listener(change);
    } catch (err) {
      console.error("notifyDataChanged: listener failed:", err);
    }
  }

  try {
    if (isTauri()) {
      const { emit } = await import("@tauri-apps/api/event");
      await emit(CHANNEL, change);
      return;
    }
    getChannel()?.postMessage(change);
  } catch (err) {
    console.error("notifyDataChanged: failed to announce:", err);
  }
}

/**
 * Subscribes to changes. Returns the unsubscribe function.
 *
 * Both transports are wired up: the Tauri listener is asynchronous, so the
 * returned teardown also cancels a subscription that is still being set up
 * when the component unmounts.
 */
export function onDataChanged(listener: Listener): () => void {
  localListeners.add(listener);

  let cancelled = false;
  let unlistenTauri: (() => void) | null = null;

  const bc = isTauri() ? null : getChannel();
  const onMessage = (e: MessageEvent<DataChange>) => listener(e.data);
  bc?.addEventListener("message", onMessage);

  if (isTauri()) {
    void (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        const off = await listen<DataChange>(CHANNEL, (e) => listener(e.payload));
        if (cancelled) off();
        else unlistenTauri = off;
      } catch (err) {
        console.error("onDataChanged: failed to subscribe:", err);
      }
    })();
  }

  return () => {
    cancelled = true;
    localListeners.delete(listener);
    bc?.removeEventListener("message", onMessage);
    unlistenTauri?.();
  };
}
