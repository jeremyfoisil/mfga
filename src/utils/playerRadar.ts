// Scoring pur du radar joueur (toile d'araignée). Aucune dépendance Vue/runtime
// afin de pouvoir le raisonner et le vérifier isolément.

export interface RadarAxis { label: string; value: number }

// Le sous-ensemble des stats WC26 que le radar lit.
export interface RadarStats {
  minutes: number
  rating: string | null
  goals: number
  assists: number
  shotsTotal: number | null
  passesTotal: number | null
  passesAccuracy: number | null
  passesKey: number | null
  dribblesSuccess: number | null
  tacklesTotal: number | null
  interceptions: number | null
  blocks: number | null
  duelsTotal: number | null
  duelsWon: number | null
  conceded: number | null
  saves: number | null
  position: string
  appearances: number
  lineups: number
}

// Maxima de référence : la valeur qui vaut 100 sur chaque sous-métrique. Les
// stats de volume sont en par-90 ; les taux (note, précision, % duels) directs.
const REF = {
  goalsP90: 0.6, assistsP90: 0.4, shotsP90: 3.5,
  passesP90: 70, keyPassesP90: 2, dribblesP90: 2,
  tacklesP90: 3.5, interceptionsP90: 2, blocksP90: 1,
  duelsWonP90: 8, minutes: 270,
  savesP90: 4, concededP90: 2.5,
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))

// Une sous-métrique vaut clamp01(value/ref), ou null (absente) si value est null.
type Sub = number | null
const sub = (value: number | null, ref: number): Sub =>
  value == null ? null : clamp01(value / ref)

// Moyenne des sous-métriques présentes, ramenée à 0..100 (0 si aucune présente).
function axisScore(subs: Sub[]): number {
  const present = subs.filter((s): s is number => s !== null)
  if (present.length === 0) return 0
  return Math.round((present.reduce((a, b) => a + b, 0) / present.length) * 100)
}

export function radarAxes(s: RadarStats): RadarAxis[] {
  // Par-90 : null (absent) quand la stat est null ou qu'aucune minute n'est jouée.
  const p90 = (value: number | null): number | null =>
    value == null || s.minutes === 0 ? null : (value / s.minutes) * 90

  const ratingNum = s.rating == null ? null : Number(s.rating)
  const rating = ratingNum != null && !Number.isNaN(ratingNum) ? ratingNum : null
  const winRate = s.duelsTotal && s.duelsTotal > 0 ? (s.duelsWon ?? 0) / s.duelsTotal : null
  const starter = s.appearances > 0 ? s.lineups / s.appearances : null

  // Défense : tacles/interceptions/contres pour tous, plus les métriques de
  // gardien. Les arrêts sont nuls pour un joueur de champ (donc ignorés). Les
  // buts encaissés ne comptent que pour un gardien (sinon le 0 d'un joueur de
  // champ gonflerait l'axe) et sont inversés : moins on encaisse, mieux c'est.
  const defenseSubs: Sub[] = [
    sub(p90(s.tacklesTotal), REF.tacklesP90),
    sub(p90(s.interceptions), REF.interceptionsP90),
    sub(p90(s.blocks), REF.blocksP90),
    sub(p90(s.saves), REF.savesP90),
  ]
  if (s.position === 'Goalkeeper') {
    const concededP90 = p90(s.conceded)
    defenseSubs.push(concededP90 == null ? null : clamp01(1 - concededP90 / REF.concededP90))
  }

  return [
    { label: 'Note', value: axisScore([sub(rating, 10)]) },
    { label: 'Attaque', value: axisScore([
      sub(p90(s.goals), REF.goalsP90),
      sub(p90(s.assists), REF.assistsP90),
      sub(p90(s.shotsTotal), REF.shotsP90),
    ]) },
    { label: 'Création', value: axisScore([
      sub(p90(s.passesTotal), REF.passesP90),
      sub(s.passesAccuracy, 100),
      sub(p90(s.passesKey), REF.keyPassesP90),
      sub(p90(s.dribblesSuccess), REF.dribblesP90),
    ]) },
    { label: 'Défense', value: axisScore(defenseSubs) },
    { label: 'Duels', value: axisScore([
      sub(p90(s.duelsWon), REF.duelsWonP90),
      sub(winRate, 1),
    ]) },
    { label: 'Temps de jeu', value: axisScore([
      sub(s.minutes, REF.minutes),
      sub(starter, 1),
    ]) },
  ]
}
