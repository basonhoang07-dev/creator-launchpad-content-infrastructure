"use client";

// components/ui.tsx
//
// Shared visual primitives, ported verbatim from cl_dashboard_prototype.jsx
// (Logo, SlateDivider, SectionHeader, Card, Button, Badge, Field, inputStyle,
// Modal, EmptyState). No redesign — every page imports these instead of
// redefining them locally, same as the prototype's single-file version did.

import React, { useState } from "react";
import { HelpCircle, X } from "lucide-react";
import { C, LOGO_DATA_URI } from "@/lib/theme";

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <img
      src={LOGO_DATA_URI}
      alt="Creator Launchpad"
      width={size}
      height={size}
      style={{ borderRadius: size * 0.22, display: "block", flexShrink: 0 }}
    />
  );
}

export function SlateDivider({ style }: { style?: React.CSSProperties }) {
  return (
    <svg width="100%" height="10" viewBox="0 0 400 10" preserveAspectRatio="none" style={{ display: "block", ...style }}>
      <defs>
        <pattern id="slateStripe" width="18" height="10" patternUnits="userSpaceOnUse" patternTransform="skewX(-25)">
          <rect width="9" height="10" fill={C.accent} opacity="0.9" />
          <rect x="9" width="9" height="10" fill={C.surface3} opacity="0.6" />
        </pattern>
      </defs>
      <rect width="400" height="10" fill="url(#slateStripe)" />
    </svg>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          {eyebrow && (
            <div
              className="cl-mono"
              style={{ fontSize: 11, letterSpacing: "0.12em", color: C.accentLight, marginBottom: 4, textTransform: "uppercase" }}
            >
              {eyebrow}
            </div>
          )}
          <h2 className="cl-display" style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>
            {title}
          </h2>
        </div>
        {action}
      </div>
      <SlateDivider style={{ marginTop: 12, borderRadius: 2, overflow: "hidden", width: 120 }} />
    </div>
  );
}

export function Card({ children, style, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      style={{
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: 20,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  children,
  variant = "primary",
  size = "md",
  style,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "sm" | "md" }) {
  const base: React.CSSProperties = {
    fontFamily: "'Inter', sans-serif",
    fontWeight: 600,
    fontSize: size === "sm" ? 13 : 14,
    padding: size === "sm" ? "7px 12px" : "10px 16px",
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "transparent",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    transition: "background 0.15s, border-color 0.15s, opacity 0.15s",
  };
  const variants: Record<ButtonVariant, React.CSSProperties> = {
    primary: { background: C.accent, color: "#fff" },
    secondary: { background: C.surface3, color: C.text, borderColor: C.borderLight },
    ghost: { background: "transparent", color: C.textMuted, borderColor: "transparent" },
    danger: { background: "transparent", color: C.danger, borderColor: C.danger },
  };
  return (
    <button style={{ ...base, ...variants[variant], ...style }} {...rest}>
      {children}
    </button>
  );
}

type BadgeTone = "default" | "accent" | "success" | "warning";

export function Badge({ children, tone = "default" }: { children: React.ReactNode; tone?: BadgeTone }) {
  const tones: Record<BadgeTone, { bg: string; color: string }> = {
    default: { bg: C.surface3, color: C.textMuted },
    accent: { bg: C.accentDim, color: C.accentLight },
    success: { bg: "rgba(61,220,132,0.14)", color: C.success },
    warning: { bg: "rgba(245,166,35,0.14)", color: C.warning },
  };
  const t = tones[tone];
  return (
    <span
      className="cl-mono"
      style={{ background: t.bg, color: t.color, fontSize: 11, padding: "3px 8px", borderRadius: 6, fontWeight: 600, letterSpacing: "0.02em" }}
    >
      {children}
    </span>
  );
}

export function Field({ label, children }: { label?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 6, fontWeight: 600 }}>{label}</div>
      {children}
    </label>
  );
}

export const inputStyle: React.CSSProperties = {
  width: "100%",
  background: C.surface2,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: "9px 12px",
  color: C.text,
  fontSize: 14,
};

export function Modal({
  title,
  onClose,
  children,
  width = 520,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
}) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}
      onClick={onClose}
    >
      <div
        className="cl-scroll"
        style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, width, maxWidth: "100%", maxHeight: "85vh", overflowY: "auto", padding: 24 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h3 className="cl-display" style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
            {title}
          </h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", padding: 4 }}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  text,
  action,
}: {
  // Typed loosely on purpose: lucide-react icon components carry a
  // `propTypes` shape that doesn't structurally match a narrower inline
  // ComponentType signature, even though every icon here is drop-in
  // compatible at runtime.
  icon: React.ElementType;
  text: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div style={{ textAlign: "center", padding: "48px 20px", color: C.textFaint }}>
      <Icon size={28} style={{ marginBottom: 10, opacity: 0.5 }} />
      <div style={{ fontSize: 14, marginBottom: action ? 14 : 0 }}>{text}</div>
      {action}
    </div>
  );
}

// A small "(?)" that reveals an explanation on hover or tap — replaces
// native `title` attributes, which only show after a long hover delay, look
// like plain browser chrome, and don't work on touch at all. Meant to sit
// right next to whatever it's explaining (a button, a field label, a toggle)
// rather than being the only way to discover what that thing does.
export function InfoTooltip({ text, width = 240 }: { text: string; width?: number }) {
  const [show, setShow] = useState(false);
  return (
    <span
      style={{ position: "relative", display: "inline-flex", alignItems: "center" }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setShow((s) => !s);
        }}
        aria-label="More info"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: "none",
          border: "none",
          padding: 0,
          margin: 0,
          cursor: "help",
          color: C.textFaint,
          lineHeight: 0,
        }}
      >
        <HelpCircle size={13} />
      </button>
      {show && (
        <div
          role="tooltip"
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            left: "50%",
            transform: "translateX(-50%)",
            width,
            maxWidth: "min(80vw, " + width + "px)",
            background: C.surface3,
            border: `1px solid ${C.borderLight}`,
            borderRadius: 8,
            padding: "8px 10px",
            fontSize: 11.5,
            lineHeight: 1.5,
            color: C.text,
            zIndex: 50,
            boxShadow: "0 6px 16px rgba(0,0,0,0.35)",
            textAlign: "left",
          }}
        >
          {text}
        </div>
      )}
    </span>
  );
}
