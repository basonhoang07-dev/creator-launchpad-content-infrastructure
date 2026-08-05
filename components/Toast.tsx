"use client";

// components/Toast.tsx
//
// Shared error/success surfacing. Most mutation handlers across the app were
// firing Supabase writes after an optimistic local update with no feedback
// if the write actually failed — the UI would look saved, then silently
// revert on the next reload with no explanation. Mounted once in AppShell;
// call `useToast().showToast(message)` from any client component's catch block.

import React, { createContext, useCallback, useContext, useState } from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { C } from "@/lib/theme";

interface ToastItem {
  id: string;
  message: string;
  tone: "error" | "success";
}

interface ToastContextValue {
  showToast: (message: string, tone?: "error" | "success") => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, tone: "error" | "success" = "error") => {
      const id = Math.random().toString(36).slice(2);
      setToasts((prev) => [...prev, { id, message, tone }]);
      setTimeout(() => dismiss(id), tone === "error" ? 8000 : 4000);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div style={{ position: "fixed", bottom: 20, right: 20, zIndex: 500, display: "grid", gap: 8, maxWidth: 380 }}>
        {toasts.map((t) => {
          const Icon = t.tone === "error" ? AlertCircle : CheckCircle2;
          const color = t.tone === "error" ? C.danger : C.success;
          return (
            <div
              key={t.id}
              style={{
                display: "flex", alignItems: "flex-start", gap: 10,
                background: C.surface2, border: `1px solid ${color}`, borderRadius: 10,
                padding: "12px 14px", boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
              }}
            >
              <Icon size={16} color={color} style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 13, color: C.text, flex: 1, lineHeight: 1.4 }}>{t.message}</span>
              <button onClick={() => dismiss(t.id)} style={{ background: "none", border: "none", color: C.textFaint, cursor: "pointer", padding: 0, flexShrink: 0 }}>
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}

// Extracts a usable message from anything a catch block might receive.
export function toastMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
