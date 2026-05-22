import type { Goal } from '../types'

export function parseGoals(text: string): Goal[] {
  if (!text || !text.trim()) return []
  return text.trim().split('\n').filter(l => l.trim()).map(line => {
    const parts = line.split(',').map(s => s.trim())
    const name = parts[0] || ''
    const minute = parseInt(parts[1]) || 0
    const rest = parts.slice(2).join(' ').toLowerCase()
    const g: Goal = { name, minute }
    if (rest.includes('pen')) g.penalty = true
    if (rest.includes('csc') || rest.includes('og')) g.owngoal = true
    return g
  }).filter(g => g.name && g.minute)
}

export function goalsToText(goals: Goal[]): string {
  return (goals || []).map(g => {
    const parts: (string | number)[] = [g.name, g.minute]
    if (g.penalty) parts.push('pen')
    if (g.owngoal) parts.push('csc')
    return parts.join(', ')
  }).join('\n')
}
