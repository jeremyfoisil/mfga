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

// A single representative solid color per team, for thin bars / legends where a
// multi-stop flag gradient would be unreadable. Picks the first non-whiteish hex
// from the flag gradient (so e.g. a white-topped flag yields its colored band),
// falling back to the first hex, then a neutral slate.
export function getFlagColor(name: string): string {
  const fr = TEAM_EN_FR[name] || name
  const hexes = (FLAG_COLORS[fr] || "").match(/#[0-9a-fA-F]{6}/g) || []
  const isWhiteish = (h: string) =>
    parseInt(h.slice(1, 3), 16) > 230 && parseInt(h.slice(3, 5), 16) > 230 && parseInt(h.slice(5, 7), 16) > 230
  return hexes.find(h => !isWhiteish(h)) || hexes[0] || "#64748b"
}
