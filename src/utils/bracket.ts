import type { Match } from '../types'
import { R32_SLOTS, FEEDS, FINAL_MATCH, THIRD_MATCH, roundLabel, type Seed } from '../constants/bracket'

export interface GroupRank { group: string; team: string; rank: number }
export interface BracketTeam { name: string | null; won: boolean }
export interface BracketCell {
  match: number
  round: string
  top: BracketTeam
  bottom: BracketTeam
  scoreTop: string
  scoreBottom: string
  live: boolean
}
export interface BracketModel { cells: Record<number, BracketCell>; champion: string | null }

const ALL_MATCHES = [...R32_SLOTS.map(s => s.match), 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, THIRD_MATCH, FINAL_MATCH]

function seedTeam(seed: Seed, bySeed: Map<string, string>): string | null {
  if (seed.kind === 'third') return null
  return bySeed.get((seed.kind === 'win' ? '1' : '2') + seed.group) ?? null
}

export function buildBracket(matches: Match[], ranks: GroupRank[]): BracketModel {
  // 1. graines vainqueur/2e -> équipe
  const bySeed = new Map<string, string>()
  for (const r of ranks) if (r.rank === 1 || r.rank === 2) bySeed.set(r.rank + r.group, r.team)

  // 2. matchs réels indexés par stage
  const byStage = new Map<string, Match[]>()
  for (const mt of matches) {
    if (!byStage.has(mt.stage)) byStage.set(mt.stage, [])
    byStage.get(mt.stage)!.push(mt)
  }

  // store -> { match number -> Match }, et { match number -> [team, team] }
  const slotMatch: Record<number, Match> = {}
  const slotTeams: Record<number, string[]> = {}

  const teamsOf = (mt: Match): string[] => [mt.home, mt.away]

  // 3. placer les 32es par graine d'ancrage (a est toujours résoluble)
  const r32 = byStage.get('r32') ?? []
  const usedR32 = new Set<number>()
  for (const slot of R32_SLOTS) {
    const anchor = seedTeam(slot.a, bySeed) // a toujours win/run
    if (!anchor) continue
    const mt = r32.find(x => !usedR32.has(x.id) && (x.home === anchor || x.away === anchor))
    if (!mt) continue
    usedR32.add(mt.id)
    slotMatch[slot.match] = mt
    slotTeams[slot.match] = teamsOf(mt)
  }

  // Repli : si aucune graine résolue, placer les 32es dans l'ordre des colonnes par id croissant.
  if (Object.keys(slotMatch).length === 0 && r32.length) {
    const order = [73, 75, 74, 77, 83, 84, 81, 82, 76, 78, 79, 80, 86, 88, 85, 87]
    const sorted = [...r32].sort((a, b) => a.id - b.id)
    order.forEach((mn, i) => { if (sorted[i]) { slotMatch[mn] = sorted[i]; slotTeams[mn] = teamsOf(sorted[i]) } })
  }

  // 4. sous-arbres : union des équipes sous chaque numéro de match (bottom-up)
  const subtree: Record<number, Set<string>> = {}
  const computeSubtree = (mn: number): Set<string> => {
    if (subtree[mn]) return subtree[mn]
    const s = new Set<string>()
    if (FEEDS[mn]) for (const c of FEEDS[mn]) for (const t of computeSubtree(c)) s.add(t)
    for (const t of (slotTeams[mn] ?? [])) s.add(t)
    subtree[mn] = s
    return s
  }
  ALL_MATCHES.forEach(computeSubtree)

  // 5. placer les rounds supérieurs : un match d'un stage va dans le slot du même
  //    stage dont le sous-arbre contient ses DEUX équipes.
  const upper: [string, number[]][] = [
    ['r16', [89, 90, 91, 92, 93, 94, 95, 96]],
    ['qf', [97, 98, 99, 100]],
    ['sf', [101, 102]],
    ['3rd', [THIRD_MATCH]],
    ['final', [FINAL_MATCH]],
  ]
  for (const [stage, slots] of upper) {
    const pool = byStage.get(stage) ?? []
    const used = new Set<number>()
    for (const mn of slots) {
      const sub = subtree[mn]
      const skipContainment = (stage === 'final' || stage === '3rd') && sub.size === 0
      const mt = pool.find(x => !used.has(x.id) && (skipContainment || (sub.has(x.home) && sub.has(x.away))))
      if (!mt) continue
      used.add(mt.id)
      slotMatch[mn] = mt
      slotTeams[mn] = teamsOf(mt)
    }
  }

  // 6. construire les cellules + orientation top/bottom + score + live
  const cells: Record<number, BracketCell> = {}
  for (const mn of ALL_MATCHES) {
    const mt = slotMatch[mn]
    if (!mt) continue
    // Orientation : pour les 32es, top = équipe de la graine `a` si connue ; sinon home.
    let topName = mt.home
    const slot = R32_SLOTS.find(s => s.match === mn)
    if (slot) {
      const aTeam = seedTeam(slot.a, bySeed)
      if (aTeam && (mt.home === aTeam || mt.away === aTeam)) topName = aTeam
    }
    const botName = mt.home === topName ? mt.away : mt.home
    const scoreTop = mt.home === topName ? mt.result.home : mt.result.away
    const scoreBottom = mt.home === topName ? mt.result.away : mt.result.home
    cells[mn] = {
      match: mn, round: roundLabel(mn),
      top: { name: topName, won: false },
      bottom: { name: botName, won: false },
      scoreTop, scoreBottom,
      live: mt.liveStatus === 'live',
    }
  }

  // 7. vainqueur de chaque match : au score si décisif, sinon par progression
  //    (équipe réapparaissant dans le vrai match parent — gère les tirs au but).
  const scoreWinner = (c: BracketCell): string | null => {
    if (c.scoreTop === '' || c.scoreBottom === '') return null
    const a = parseInt(c.scoreTop), b = parseInt(c.scoreBottom)
    if (a > b) return c.top.name
    if (b > a) return c.bottom.name
    return null // nul : tirs au but, indécidable au score
  }
  const winner: Record<number, string | null> = {}
  for (const mn of ALL_MATCHES) winner[mn] = cells[mn] ? scoreWinner(cells[mn]) : null

  // Repli progression pour les matchs nuls : si le vrai match parent existe,
  // l'équipe d'un enfant qui y figure est la qualifiée.
  for (const [parentStr, kids] of Object.entries(FEEDS)) {
    const parent = Number(parentStr)
    if (parent === THIRD_MATCH) continue
    const pc = cells[parent]
    if (!pc) continue
    const parentNames = [pc.top.name, pc.bottom.name]
    for (const child of kids) {
      if (winner[child]) continue
      const cc = cells[child]
      if (!cc) continue
      const adv = [cc.top.name, cc.bottom.name].find(n => n && parentNames.includes(n)) ?? null
      if (adv) winner[child] = adv
    }
  }

  // 8. marquer le vainqueur sur chaque cellule existante
  for (const mn of ALL_MATCHES) {
    const c = cells[mn], w = winner[mn]
    if (!c || !w) continue
    if (c.top.name === w) c.top.won = true
    else if (c.bottom.name === w) c.bottom.won = true
  }

  // 9. projeter les qualifiés dans les slots parents sans vrai match, pour que le
  //    vainqueur apparaisse au tour suivant avant même la création du match.
  //    (3e place : perdants des demies.)
  const loserOf = (mn: number): string | null => {
    const c = cells[mn], w = winner[mn]
    if (!c || !w) return null
    return c.top.name === w ? c.bottom.name : c.top.name
  }
  for (const [parentStr, kids] of Object.entries(FEEDS)) {
    const parent = Number(parentStr)
    if (cells[parent]) continue // vrai match déjà présent
    const isThird = parent === THIRD_MATCH
    const topName = isThird ? loserOf(kids[0]) : winner[kids[0]]
    const botName = isThird ? loserOf(kids[1]) : winner[kids[1]]
    if (!topName && !botName) continue
    cells[parent] = {
      match: parent, round: roundLabel(parent),
      top: { name: topName, won: false },
      bottom: { name: botName, won: false },
      scoreTop: '', scoreBottom: '', live: false,
    }
  }

  // 10. champion = vainqueur de la finale
  const champion: string | null = winner[FINAL_MATCH] ?? null

  return { cells, champion }
}
