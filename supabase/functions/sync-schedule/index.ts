import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const RAPIDAPI_KEY = Deno.env.get('RAPIDAPI_KEY') ?? '4f5231439dmshc22c83b5cde5ef3p1d9c86jsn739feb141fa8'

interface ApiMatch {
  id: number
  home: string
  away: string
  date: string
  time: string   // "13:00 UTC-6"
  group: string | null
  venue: string
  round: string
}

interface ApiDay {
  date: string
  matches: ApiMatch[]
}

const TEAM_EN_FR: Record<string, string> = {
  "Mexico": "Mexique", "South Africa": "Afrique du Sud", "South Korea": "Corée du Sud", "Czech Republic": "Rép. tchèque",
  "Canada": "Canada", "Bosnia & Herzegovina": "Bosnie-Herzégovine", "Qatar": "Qatar", "Switzerland": "Suisse",
  "Brazil": "Brésil", "Morocco": "Maroc", "Haiti": "Haïti", "Scotland": "Écosse",
  "USA": "États-Unis", "Paraguay": "Paraguay", "Australia": "Australie", "Turkey": "Turquie",
  "Germany": "Allemagne", "Curaçao": "Curaçao", "Ivory Coast": "Côte d'Ivoire", "Ecuador": "Équateur",
  "Netherlands": "Pays-Bas", "Japan": "Japon", "Sweden": "Suède", "Tunisia": "Tunisie",
  "Belgium": "Belgique", "Egypt": "Égypte", "Iran": "Iran", "New Zealand": "Nouvelle-Zélande",
  "Spain": "Espagne", "Cape Verde": "Cap-Vert", "Saudi Arabia": "Arabie Saoudite", "Uruguay": "Uruguay",
  "France": "France", "Senegal": "Sénégal", "Iraq": "Irak", "Norway": "Norvège",
  "Argentina": "Argentine", "Algeria": "Algérie", "Austria": "Autriche", "Jordan": "Jordanie",
  "Portugal": "Portugal", "DR Congo": "RD Congo", "Uzbekistan": "Ouzbékistan", "Colombia": "Colombie",
  "England": "Angleterre", "Croatia": "Croatie", "Ghana": "Ghana", "Panama": "Panama",
}

// "13:00 UTC-6" → "13:00:00-06"  (format timetz Postgres)
function toTimetz(apiTime: string): string {
  const m = apiTime.match(/(\d{1,2}):(\d{2})\s*UTC([+-]\d+)/)
  if (!m) return apiTime
  const h   = m[1].padStart(2, '0')
  const min = m[2]
  const off = parseInt(m[3])
  const sign = off < 0 ? '-' : '+'
  const abs  = Math.abs(off).toString().padStart(2, '0')
  return `${h}:${min}:00${sign}${abs}`
}

// Code de tableau type "2A", "W73", "L101", "3A/B/C/D/F" → true
function isPlaceholder(name: string): boolean {
  return /^(\d|[WL]\d)/.test(name)
}

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const apiRes = await fetch('https://wc26-live-football-api.p.rapidapi.com/schedule', {
    headers: {
      'x-rapidapi-host': 'wc26-live-football-api.p.rapidapi.com',
      'x-rapidapi-key': RAPIDAPI_KEY,
    },
  })
  if (!apiRes.ok) {
    return new Response(JSON.stringify({ error: 'API fetch failed', status: apiRes.status }), {
      status: 502, headers: { 'Content-Type': 'application/json' },
    })
  }

  const { data: days }: { data: ApiDay[] } = await apiRes.json()

  const upserts: Record<string, unknown>[] = []
  for (const day of days) {
    for (const m of day.matches) {
      const row: Record<string, unknown> = {
        id:         m.id,
        match_date: m.date,
        match_time: toTimetz(m.time),
        venue:      m.venue || null,
        round:      m.round || null,
      }

      if (m.group) {
        // Phase de poules : équipes déjà connues, rien à faire côté noms
      } else {
        // Phase KO : détecter si les équipes sont connues ou encore des codes
        const homeIsKnown = m.home && !isPlaceholder(m.home)
        const awayIsKnown = m.away && !isPlaceholder(m.away)

        if (homeIsKnown) {
          row.home_team  = TEAM_EN_FR[m.home] ?? m.home
          row.home_label = null
        } else {
          row.home_label = m.home || null
        }

        if (awayIsKnown) {
          row.away_team  = TEAM_EN_FR[m.away] ?? m.away
          row.away_label = null
        } else {
          row.away_label = m.away || null
        }
      }

      upserts.push(row)
    }
  }

  for (let i = 0; i < upserts.length; i += 50) {
    const { error } = await supabase
      .from('matches')
      .upsert(upserts.slice(i, i + 50), { onConflict: 'id' })
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  return new Response(JSON.stringify({ synced: upserts.length }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
