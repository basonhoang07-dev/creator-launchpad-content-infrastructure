// lib/theme.ts
//
// Design tokens and shared constants, ported verbatim from
// cl_dashboard_prototype.jsx (the "DESIGN TOKENS" block near the top of the
// file). Do not restyle — this is the source of truth for every color/status
// mapping used across the ported pages.

export const C = {
  bg: "#0A0A0A",
  surface: "#141414",
  surface2: "#1D1D1D",
  surface3: "#262626",
  border: "#2A2A2A",
  borderLight: "#3A3A3A",
  text: "#F2F2F0",
  textMuted: "#8F8F8F",
  textFaint: "#5C5C5C",
  accent: "#6C2BD9",
  accentLight: "#9B6EF3",
  accentDim: "rgba(108,43,217,0.16)",
  success: "#3DDC84",
  warning: "#F5A623",
  danger: "#E5484D",
};

export const STATUS_GROUPS: Record<string, string[]> = {
  "To-do": ["Unscripted", "Scripted", "Filmed"],
  "In progress": ["Editing"],
  "Complete": ["Ready", "Done"],
};

export const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  Unscripted: { bg: "rgba(108,43,217,0.18)", color: "#B79CF0" },
  Scripted: { bg: "rgba(245,166,35,0.16)", color: "#F5A623" },
  Filmed: { bg: "rgba(143,143,143,0.18)", color: "#B5B5B5" },
  Editing: { bg: "rgba(76,141,255,0.16)", color: "#4C8DFF" },
  Ready: { bg: "rgba(61,220,132,0.16)", color: "#3DDC84" },
  Done: { bg: "rgba(34,176,103,0.22)", color: "#22B067" },
};

export const FOCUS_TYPES = ["Researching & ideating", "Scripting", "Filming"];

// Broad content niches a brand board can sit in. Deliberately a fixed list
// rather than free text: this is what the Admin Viral Feed filters on, and
// free entry fragments that instantly ("fitness" / "Fitness" / "gym" all
// becoming separate buckets). Kept broad so one label covers a whole
// vertical — CUSTOM_NICHE is the escape hatch for anything genuinely new.
export const NICHES = [
  "Fitness & Health",
  "Make Money Online",
  "Productivity",
  "Study Tools",
  "Beauty & Skincare",
  "Fashion",
  "Food & Cooking",
  "Tech & Gadgets",
  "Finance & Investing",
  "Travel",
  "Home & Lifestyle",
  "Self-Improvement",
  "Career & Education",
  "Parenting",
  "Pets",
  "Gaming",
  "SaaS & Apps",
  "Dating & Relationships",
];

export const CUSTOM_NICHE = "Other (type your own)";
export const BLOCK_TYPES = ["Unavailable", "Researching & ideating", "Scripting", "Filming", "Editing"];
export const BLOCK_COLORS: Record<string, { bg: string; color: string }> = {
  Unavailable: { bg: "rgba(229,72,77,0.16)", color: "#E5484D" },
  "Researching & ideating": { bg: "rgba(76,141,255,0.16)", color: "#4C8DFF" },
  Scripting: { bg: "rgba(245,166,35,0.16)", color: "#F5A623" },
  Filming: { bg: "rgba(108,43,217,0.20)", color: "#B79CF0" },
  Editing: { bg: "rgba(76,141,255,0.20)", color: "#6FA8FF" },
};

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const ROLES = ["Admin", "Client", "VA/Editor", "Creative Director"] as const;
export type Role = (typeof ROLES)[number];

// Same nav-label-per-role map the prototype uses for the workload page.
export const WORKLOAD_LABELS: Record<Role, string> = {
  Client: "Filming Needs",
  "Creative Director": "Scripting Needs",
  "VA/Editor": "My Assignments",
  Admin: "Team Workload",
};

// Same embedded brand mark data URI as the prototype (kept verbatim so the
// logo doesn't depend on shipping a separate asset file).
export const LOGO_DATA_URI =
  "data:image/png;base64,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";
