import type { ConfettiBit, KOStage } from '../types'

export const C = {
  bg: "#0a0e1a", card: "#111827", border: "#1e293b", accent: "#3b82f6",
  gold: "#f59e0b", silver: "#94a3b8", bronze: "#cd7c2f",
  text: "#f1f5f9", muted: "#64748b", green: "#22c55e", yellow: "#eab308",
  red: "#dc2626", blue: "#1e3a8a", whiteUS: "#f8fafc",
} as const

export const TABS = ["Participants", "Matchs", "Bonus", "Classement", "Statistiques"] as const

export const KO_STAGES: KOStage[] = [
  { id: "r32",   label: "32èmes" },
  { id: "r16",   label: "16èmes" },
  { id: "qf",    label: "Quarts" },
  { id: "sf",    label: "Demies" },
  { id: "3rd",   label: "3e place" },
  { id: "final", label: "Finale" },
]

export const GROUP_IDS = ["A","B","C","D","E","F","G","H","I","J","K","L"] as const

export const CONFETTI_BITS: ConfettiBit[] = [
  { left: "8%",  delay: "0s",   dur: "3.2s", color: "#dc2626" },
  { left: "18%", delay: "0.6s", dur: "3.8s", color: "#f8fafc" },
  { left: "32%", delay: "1.2s", dur: "3.4s", color: "#1e3a8a" },
  { left: "48%", delay: "0.3s", dur: "4.0s", color: "#fbbf24" },
  { left: "62%", delay: "1.5s", dur: "3.0s", color: "#dc2626" },
  { left: "76%", delay: "0.9s", dur: "3.6s", color: "#1e3a8a" },
  { left: "88%", delay: "1.8s", dur: "3.2s", color: "#fbbf24" },
  { left: "94%", delay: "0.2s", dur: "3.9s", color: "#f8fafc" },
]

export const medalColors = ["#f59e0b", "#94a3b8", "#cd7c2f"] as const
export const medalIcons  = ["🥇", "🥈", "🥉"] as const

export const sCard  = { background: "#111827", border: "1px solid #1e293b", borderRadius: "12px", padding: "14px", marginBottom: "10px" }
export const sInput = { background: "#1e293b", border: "1px solid #1e293b", borderRadius: "8px", color: "#f1f5f9", padding: "8px 12px", fontFamily: "'Syne', sans-serif", fontSize: "13px", outline: "none", width: "100%" }
export const sLabel = { color: "#64748b", fontSize: "11px", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: "6px", display: "block" }

export const BONUS_LOCK_DATE = new Date("2026-06-11T21:59:00Z") // 11 juin 23:59 heure Paris (CEST = UTC+2)
