// Structure officielle du tableau à élimination directe de la Coupe du Monde 2026.
// Numéros de match FIFA (73..104). Source : tableau officiel FIFA / Wikipédia.

export type Seed =
  | { kind: 'win'; group: string }   // 1X — vainqueur du groupe X
  | { kind: 'run'; group: string }   // 2X — 2e du groupe X
  | { kind: 'third' }                // 3e — résolu via le match, pas par la graine

export interface R32Slot { match: number; a: Seed; b: Seed }

// 16 matchs de 32es, chacun avec ses deux graines. `a` est toujours résoluble
// (vainqueur/2e) : aucun match n'oppose deux 3es.
export const R32_SLOTS: R32Slot[] = [
  { match: 73, a: { kind: 'run', group: 'A' }, b: { kind: 'run', group: 'B' } },
  { match: 74, a: { kind: 'win', group: 'E' }, b: { kind: 'third' } },
  { match: 75, a: { kind: 'win', group: 'F' }, b: { kind: 'run', group: 'C' } },
  { match: 76, a: { kind: 'win', group: 'C' }, b: { kind: 'run', group: 'F' } },
  { match: 77, a: { kind: 'win', group: 'I' }, b: { kind: 'third' } },
  { match: 78, a: { kind: 'run', group: 'E' }, b: { kind: 'run', group: 'I' } },
  { match: 79, a: { kind: 'win', group: 'A' }, b: { kind: 'third' } },
  { match: 80, a: { kind: 'win', group: 'L' }, b: { kind: 'third' } },
  { match: 81, a: { kind: 'win', group: 'D' }, b: { kind: 'third' } },
  { match: 82, a: { kind: 'win', group: 'G' }, b: { kind: 'third' } },
  { match: 83, a: { kind: 'run', group: 'K' }, b: { kind: 'run', group: 'L' } },
  { match: 84, a: { kind: 'win', group: 'H' }, b: { kind: 'run', group: 'J' } },
  { match: 85, a: { kind: 'win', group: 'B' }, b: { kind: 'third' } },
  { match: 86, a: { kind: 'win', group: 'J' }, b: { kind: 'run', group: 'H' } },
  { match: 87, a: { kind: 'win', group: 'K' }, b: { kind: 'third' } },
  { match: 88, a: { kind: 'run', group: 'D' }, b: { kind: 'run', group: 'G' } },
]

// Match parent -> ses deux matchs enfants (les vainqueurs des enfants jouent le parent).
export const FEEDS: Record<number, [number, number]> = {
  89: [73, 75], 90: [74, 77], 91: [76, 78], 92: [79, 80],
  93: [83, 84], 94: [81, 82], 95: [86, 88], 96: [85, 87],
  97: [89, 90], 98: [93, 94], 99: [91, 92], 100: [95, 96],
  101: [97, 98], 102: [99, 100],
  104: [101, 102], // finale
  103: [101, 102], // 3e place (perdants des demies)
}

// Ordre vertical de rendu (extérieur -> centre), une sous-liste par colonne.
export const LEFT_COLUMNS: number[][] = [
  [73, 75, 74, 77, 83, 84, 81, 82], // 32es
  [89, 90, 93, 94],                 // 8es
  [97, 98],                         // quarts
  [101],                            // demie
]
export const RIGHT_COLUMNS: number[][] = [
  [102],                            // demie
  [99, 100],                        // quarts
  [91, 92, 95, 96],                 // 8es
  [76, 78, 79, 80, 86, 88, 85, 87], // 32es
]
export const FINAL_MATCH = 104
export const THIRD_MATCH = 103

// Stage (code base) d'un numéro de match.
export function STAGE_OF(match: number): 'r32' | 'r16' | 'qf' | 'sf' | 'final' | '3rd' {
  if (match === 104) return 'final'
  if (match === 103) return '3rd'
  if (match >= 101) return 'sf'
  if (match >= 97) return 'qf'
  if (match >= 89) return 'r16'
  return 'r32'
}

export function roundLabel(match: number): string {
  const s = STAGE_OF(match)
  return s === 'r32' ? '16es' : s === 'r16' ? '8es' : s === 'qf' ? 'Quarts'
    : s === 'sf' ? 'Demies' : s === '3rd' ? '3e place' : 'Finale'
}
