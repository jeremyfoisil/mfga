import type { BonusType, BonusIcon } from '../types'

export const BONUS_TYPES: BonusType[] = [
  { id: "winner",    label: "Vainqueur du tournoi",                     points: 10, count: 1 },
  { id: "finalist",  label: "Finalistes (les 2)",                       points: 5,  count: 2 },
  { id: "semi",      label: "Demi-finalistes (les 4)",                  points: 3,  count: 4 },
  { id: "topscorer", label: "Meilleur buteur",                          points: 5,  count: 1 },
  { id: "topassist", label: "Meilleur passeur",                         points: 5,  count: 1 },
  { id: "topfouler", label: "Meilleur découpeur de jambes",             points: 5,  count: 1 },
  { id: "surprise",  label: "Meilleure surprise (hors top 10 en demi)", points: 7,  count: 1 },
  { id: "upset",     label: "Favori éliminé en groupes",                points: 6,  count: 1 },
]

export const BONUS_ICONS: Record<string, BonusIcon> = {
  winner:    { icon: "🏆", bg: "linear-gradient(135deg, #f59e0b, #d97706)" },
  finalist:  { icon: "🥈", bg: "linear-gradient(135deg, #94a3b8, #475569)" },
  semi:      { icon: "🏟️", bg: "linear-gradient(135deg, #3b82f6, #1e3a8a)" },
  topscorer: { icon: "⚽", bg: "linear-gradient(135deg, #22c55e, #15803d)" },
  topassist: { icon: "🎯", bg: "linear-gradient(135deg, #60a5fa, #1d4ed8)" },
  topfouler: { icon: "🦵", bg: "linear-gradient(135deg, #f97316, #c2410c)" },
  surprise:  { icon: "🎉", bg: "linear-gradient(135deg, #ec4899, #be185d)" },
  upset:     { icon: "💥", bg: "linear-gradient(135deg, #dc2626, #7f1d1d)" },
}
