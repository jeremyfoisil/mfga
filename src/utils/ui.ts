import { FLAG_EMOJIS, FLAG_COLORS, TEAM_EN_FR } from '../constants/teams'

export function initials(name: string): string {
  return (name || "?").trim().split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase()
}

export function getFlag(name: string): string {
  const fr = TEAM_EN_FR[name] || name
  return FLAG_EMOJIS[fr] || "🏳️"
}

export function getFlagBg(name: string): string {
  const fr = TEAM_EN_FR[name] || name
  return FLAG_COLORS[fr] || "linear-gradient(135deg, #475569, #1e293b)"
}
