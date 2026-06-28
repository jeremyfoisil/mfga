import { describe, it, expect } from 'vitest'
import { buildBracket, type GroupRank } from './bracket'
import type { Match } from '../types'

// Fabrique un Match minimal (seuls les champs lus par buildBracket comptent).
function m(id: number, stage: string, home: string, away: string, rh = '', ra = ''): Match {
  return {
    id, stage, group: null, home, away, homeKnown: true, awayKnown: true,
    homeLabel: '', awayLabel: '',
    result: { home: rh, away: ra, goalsHome: [], goalsAway: [], goalsHomeText: '', goalsAwayText: '', cardsHome: [], cardsAway: [] },
    matchDate: '', matchTime: '', venue: '', round: '', liveStatus: 'scheduled',
    liveMinute: null, liveExtra: null, oddsHome: null, oddsDraw: null, oddsAway: null,
  }
}

// Classement minimal : vainqueur/2e par groupe.
function ranks(pairs: [string, string, string][]): GroupRank[] {
  const out: GroupRank[] = []
  for (const [group, win, run] of pairs) {
    out.push({ group, team: win, rank: 1 }, { group, team: run, rank: 2 })
  }
  return out
}

describe('buildBracket', () => {
  // Groupes A..L : vainqueur = "<G>1", 2e = "<G>2". Thirds nommés "T<n>".
  const groups = ranks('ABCDEFGHIJKL'.split('').map(g => [g, g + '1', g + '2']) as [string, string, string][])

  it('place les 32es par graine d\'ancrage (vainqueur/2e), 3e via le match', () => {
    // Slot 79 = 1A vs 3e. Le match réel : A1 vs un 3e (T1).
    const matches = [m(1079, 'r32', 'A1', 'T1')]
    const model = buildBracket(matches, groups)
    const c = model.cells[79]
    expect(c).toBeDefined()
    expect(c.top.name).toBe('A1')      // 1A en haut
    expect(c.bottom.name).toBe('T1')   // 3e en bas
  })

  it('place un slot deux-graines et oriente top=a, bottom=b', () => {
    // Slot 73 = 2A vs 2B → A2 vs B2.
    const matches = [m(1073, 'r32', 'B2', 'A2')] // ordre store inversé
    const model = buildBracket(matches, groups)
    const c = model.cells[73]
    expect(c.top.name).toBe('A2')
    expect(c.bottom.name).toBe('B2')
  })

  it('mappe le score selon l\'orientation top/bottom', () => {
    // store: home=B2 away=A2, score 0-2 → top A2 doit lire 2, bottom B2 lit 0.
    const matches = [m(1073, 'r32', 'B2', 'A2', '0', '2')]
    const model = buildBracket(matches, groups)
    expect(model.cells[73].scoreTop).toBe('2')    // A2
    expect(model.cells[73].scoreBottom).toBe('0')  // B2
  })

  it('relie les 8es par sous-arbre et marque le vainqueur par progression', () => {
    // 89 ← 73(2A/2B: A2 vs B2) et 75(1F/2C: F1 vs C2). Vainqueurs A2 et F1 se rencontrent.
    const matches = [
      m(1073, 'r32', 'A2', 'B2', '1', '0'),
      m(1075, 'r32', 'F1', 'C2', '2', '1'),
      m(1089, 'r16', 'A2', 'F1', '', ''), // 8es 89
    ]
    const model = buildBracket(matches, groups)
    expect(model.cells[89]).toBeDefined()
    // A2 et F1 ont avancé (réapparaissent en 89)
    expect(model.cells[73].top.name).toBe('A2')
    expect(model.cells[73].top.won).toBe(true)   // A2 gagnant de 73
    expect(model.cells[75].top.name).toBe('F1')
    expect(model.cells[75].top.won).toBe(true)   // F1 gagnant de 75
    expect(model.cells[73].bottom.won).toBe(false)
  })

  it('gère les tirs au but : vainqueur = équipe qualifiée même si score nul', () => {
    const matches = [
      m(1073, 'r32', 'A2', 'B2', '1', '1'), // nul → tab
      m(1075, 'r32', 'F1', 'C2', '2', '1'),
      m(1089, 'r16', 'B2', 'F1'),           // B2 a passé les tab
    ]
    const model = buildBracket(matches, groups)
    expect(model.cells[73].bottom.name).toBe('B2')
    expect(model.cells[73].bottom.won).toBe(true)  // B2 qualifié malgré le nul
    expect(model.cells[73].top.won).toBe(false)
  })

  it('désigne le champion au score de la finale', () => {
    const matches = [m(1104, 'final', 'A1', 'B1', '3', '1')]
    const model = buildBracket(matches, groups)
    expect(model.champion).toBe('A1')
  })

  it('cellule absente si aucun match réel pour le slot', () => {
    const model = buildBracket([], groups)
    expect(model.cells[73]).toBeUndefined()
    expect(model.champion).toBeNull()
  })

  it('marque le vainqueur de la 3e place au score', () => {
    const matches = [m(1103, '3rd', 'A1', 'B1', '2', '0')]
    const model = buildBracket(matches, groups)
    expect(model.cells[103]).toBeDefined()
    expect(model.cells[103].top.won).toBe(true)   // A1 gagne la 3e place
    expect(model.cells[103].bottom.won).toBe(false)
  })

  it('projette le vainqueur dans le slot du tour suivant sans match réel', () => {
    // 73 = 2A/2B → A2 vs B2, A2 gagne 1-0. Aucun match de 16es en base.
    const matches = [m(1073, 'r32', 'A2', 'B2', '1', '0')]
    const model = buildBracket(matches, groups)
    expect(model.cells[73].top.name).toBe('A2')
    expect(model.cells[73].top.won).toBe(true)        // vainqueur marqué au score
    // slot 89 (8es) projeté : A2 en haut (enfant 73), pas encore joué
    expect(model.cells[89]).toBeDefined()
    expect(model.cells[89].top.name).toBe('A2')
    expect(model.cells[89].scoreTop).toBe('')
    expect(model.cells[89].top.won).toBe(false)
  })

  it('projette le vainqueur du 2e enfant en bas du slot parent', () => {
    // 75 = 1F/2C → F1 vs C2, F1 gagne 2-1. 73 absent → haut du 89 inconnu.
    const matches = [m(1075, 'r32', 'F1', 'C2', '2', '1')]
    const model = buildBracket(matches, groups)
    expect(model.cells[89].bottom.name).toBe('F1')
    expect(model.cells[89].top.name).toBeNull()
  })

  it('ne projette pas tant qu\'un match nul n\'est pas départagé', () => {
    // 73 nul, aucun match parent pour départager → pas de projection
    const matches = [m(1073, 'r32', 'A2', 'B2', '1', '1')]
    const model = buildBracket(matches, groups)
    expect(model.cells[89]).toBeUndefined()
  })
})
