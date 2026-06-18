export interface Goal {
  id?: number
  name: string
  minute: number
  penalty?: boolean
  owngoal?: boolean
  assist?: string
  assistId?: number
}

export interface Card {
  id?: number
  name: string
  minute: number
  red?: boolean
}

export interface MatchResult {
  home: string
  away: string
  goalsHome: Goal[]
  goalsAway: Goal[]
  goalsHomeText: string
  goalsAwayText: string
  cardsHome: Card[]
  cardsAway: Card[]
}

export interface Match {
  id: number
  stage: string
  group: string | null
  home: string
  away: string
  homeKnown: boolean
  awayKnown: boolean
  homeLabel: string
  awayLabel: string
  result: MatchResult
  matchDate: string
  matchTime: string
  venue: string
  round: string
  liveStatus: string
  // Minute en cours d'un match live, récupérée de l'API (null sinon).
  // liveExtra = temps additionnel éventuel (ex. 45+2').
  liveMinute: number | null
  liveExtra: number | null
}

export interface Participant {
  id: number
  name: string
  color: string
}

export interface Prono {
  home: string
  away: string
}

export interface BonusType {
  id: string
  label: string
  points: number
  count: number
}

export interface BonusIcon {
  icon: string
  bg: string
}

export interface ConfettiBit {
  left: string
  delay: string
  dur: string
  color: string
}

export interface MeltingPotFlag {
  c: string
  x: string
  y: string
  w: number
  h: number
  r: number
}

export interface KOStage {
  id: string
  label: string
}

export interface RankedParticipant extends Participant {
  total: number
  exactCount: number
  diagCount: number
}
