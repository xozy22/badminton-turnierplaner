import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export type ToastKind = "success" | "error" | "info";

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  /** Duration in ms. 0 means "no auto-dismiss". */
  duration: number;
}

interface ToastContextValue {
  toasts: Toast[];
  showToast: (message: string, kind?: ToastKind, durationMs?: number) => number;
  showSuccess: (message: string, durationMs?: number) => number;
  showError: (message: string, durationMs?: number) => number;
  showInfo: (message: string, durationMs?: number) => number;
  dismissToast: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue>({
  toasts: [],
  showToast: () => 0,
  showSuccess: () => 0,
  showError: () => 0,
  showInfo: () => 0,
  dismissToast: () => {},
});

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, kind: ToastKind = "info", durationMs = 3000): number => {
      const id = nextId++;
      const toast: Toast = { id, kind, message, duration: durationMs };
      setToasts((prev) => [...prev, toast]);
      if (durationMs > 0) {
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, durationMs);
      }
      return id;
    },
    []
  );

  const showSuccess = useCallback(
    (message: string, durationMs = 3000) => showToast(message, "success", durationMs),
    [showToast]
  );
  const showError = useCallback(
    (message: string, durationMs = 5000) => showToast(message, "error", durationMs),
    [showToast]
  );
  const showInfo = useCallback(
    (message: string, durationMs = 3000) => showToast(message, "info", durationMs),
    [showToast]
  );

  return (
    <ToastContext.Provider value={{ toasts, showToast, showSuccess, showError, showInfo, dismissToast }}>
      {children}
      <ToastStack />
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

function ToastStack() {
  const { toasts, dismissToast } = useContext(ToastContext);
  // The region stays mounted even when empty: a live region has to exist
  // before its content changes, or screen readers miss the first message
  // (REVIEW-BACKLOG.md G4).
  return (
    <div
      className="fixed bottom-6 right-6 z-[1000] flex flex-col gap-2 items-end pointer-events-none"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => dismissToast(t.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const palette: Record<ToastKind, { bg: string; icon: string }> = {
    success: { bg: "bg-success", icon: "✓" },
    error: { bg: "bg-danger", icon: "✕" },
    info: { bg: "bg-info", icon: "ℹ" },
  };
  const { bg, icon } = palette[toast.kind];
  return (
    <div
      className={`flex items-center gap-2 ${bg} text-white px-4 py-3 rounded-xl shadow-lg text-sm font-medium pointer-events-auto max-w-sm`}
      role={toast.kind === "error" ? "alert" : "status"}
      aria-live={toast.kind === "error" ? "assertive" : "polite"}
    >
      <span aria-hidden="true">{icon}</span>
      <span className="flex-1 whitespace-pre-line break-words">{toast.message}</span>
      <button
        onClick={onDismiss}
        className="opacity-70 hover:opacity-100 transition-opacity text-lg leading-none ml-1"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
