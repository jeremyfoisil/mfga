# Vite/Vue/TS/Pinia Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrer `index.html` (1875 lignes, Vue 3 CDN) vers un projet Vite + Vue 3 + TypeScript + Pinia sans changer le rendu visuel ni la logique métier.

**Architecture:** Le code est découpé en constantes, utils pures, stores Pinia et composants Vue `<script setup>`. `App.vue` orchestre auth + chargement des données via `onMounted`. Les tabs sont des composants indépendants qui lisent les stores directement.

**Tech Stack:** Vite 5, Vue 3.4, TypeScript 5, Pinia 2, @supabase/supabase-js 2, peaceiris/actions-gh-pages (GitHub Actions)

---

## Fichiers créés / modifiés

| Fichier | Rôle |
|---------|------|
| `package.json` | Dépendances npm |
| `vite.config.ts` | Config Vite avec `base: '/mfga/'` |
| `tsconfig.json` | Config TypeScript |
| `index.html` | Entrée Vite minimale (remplace l'ancien) |
| `src/main.ts` | Bootstrap createApp + Pinia |
| `src/App.vue` | Root : AuthScreen ou layout principal |
| `src/supabase.ts` | Client Supabase singleton |
| `src/types/index.ts` | Interfaces TS |
| `src/constants/teams.ts` | GROUPS, ALL_TEAMS, FLAG_EMOJIS, FLAG_COLORS, TEAM_EN_FR, MELTING_POT_FLAGS |
| `src/constants/bonus.ts` | BONUS_TYPES, BONUS_ICONS |
| `src/constants/ui.ts` | C, TABS, KO_STAGES, GROUP_IDS, CONFETTI_BITS, medalColors, medalIcons |
| `src/utils/match.ts` | calcMatchPoints, mapMatchRow, matchStartsAtMs, formatDate |
| `src/utils/goals.ts` | parseGoals, goalsToText |
| `src/utils/ui.ts` | initials, getFlag, getFlagBg |
| `src/stores/auth.ts` | Pinia : session, profile, login/logout/register |
| `src/stores/app.ts` | Pinia : loaded, tab, rtStatus, saveMsg, loadData, startRealtime |
| `src/stores/matches.ts` | Pinia : matches[], setMatchResult, setMatchGoalText |
| `src/stores/participants.ts` | Pinia : participants[] |
| `src/stores/pronostics.ts` | Pinia : pronostics{}, jokers{}, setProno, toggleJoker |
| `src/stores/bonus.ts` | Pinia : bonusPronostics{}, bonusResults{}, setBonus, setBonusResult |
| `src/stores/admin.ts` | Pinia : isAdmin, modals, submitAdminPass, importJson |
| `src/components/AppHeader.vue` | Topbar + mascot + title + tabs |
| `src/components/AuthScreen.vue` | Formulaire login/register |
| `src/components/tabs/TabParticipants.vue` | Onglet participants |
| `src/components/tabs/TabMatchs.vue` | Onglet matchs |
| `src/components/tabs/TabBonus.vue` | Onglet bonus |
| `src/components/tabs/TabTableau.vue` | Onglet tableau phase finale |
| `src/components/tabs/TabClassement.vue` | Onglet classement |
| `src/components/modals/AdminModal.vue` | Modal mot de passe admin |
| `src/components/modals/ImportModal.vue` | Modal import JSON |
| `public/assets/mascot.png` | Copié depuis `assets/mascot.png` |
| `public/assets/tableau.png` | Copié depuis `assets/tableau.png` |
| `.github/workflows/deploy.yml` | CI/CD GitHub Pages |

---

## Task 1 : Scaffold Vite + Vue 3 + TypeScript

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `index.html` (remplace l'existant)

- [ ] **Step 1 : Sauvegarder l'ancien index.html**

```bash
cp index.html index.html.bak
```

- [ ] **Step 2 : Créer `package.json`**

```json
{
  "name": "mfga",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.45.4",
    "pinia": "^2.2.6",
    "vue": "^3.5.13"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.2.1",
    "typescript": "^5.6.3",
    "vite": "^5.4.11",
    "vue-tsc": "^2.1.10"
  }
}
```

- [ ] **Step 3 : Créer `vite.config.ts`**

```typescript
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: '/mfga/',
})
```

- [ ] **Step 4 : Créer `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "preserve",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "src/**/*.vue"]
}
```

- [ ] **Step 5 : Créer le nouvel `index.html`**

```html
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>MFGA — Make Football Goat Again</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Anton&family=Syne:wght@400;600;700;800&display=swap" rel="stylesheet" />
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 6 : Créer les dossiers src**

```bash
mkdir -p src/constants src/utils src/stores src/components/tabs src/components/modals src/types public/assets
```

- [ ] **Step 7 : Copier les assets**

```bash
cp assets/mascot.png public/assets/mascot.png
cp assets/tableau.png public/assets/tableau.png
```

- [ ] **Step 8 : Installer les dépendances**

```bash
npm install
```

Expected: dossier `node_modules/` créé, pas d'erreur.

- [ ] **Step 9 : Commit**

```bash
git add package.json vite.config.ts tsconfig.json index.html public/
git commit -m "chore: scaffold Vite/Vue/TS project"
```

---

## Task 2 : Types TypeScript

**Files:**
- Create: `src/types/index.ts`

- [ ] **Step 1 : Créer `src/types/index.ts`**

```typescript
export interface Goal {
  name: string
  minute: number
  penalty?: boolean
  owngoal?: boolean
}

export interface MatchResult {
  home: string
  away: string
  goalsHome: Goal[]
  goalsAway: Goal[]
  goalsHomeText: string
  goalsAwayText: string
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
```

- [ ] **Step 2 : Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add TypeScript types"
```

---

## Task 3 : Constantes

**Files:**
- Create: `src/constants/teams.ts`
- Create: `src/constants/bonus.ts`
- Create: `src/constants/ui.ts`

- [ ] **Step 1 : Créer `src/constants/teams.ts`**

```typescript
import type { MeltingPotFlag } from '../types'

export const GROUPS: { id: string; teams: string[] }[] = [
  { id: "A", teams: ["Mexique", "Afrique du Sud", "Corée du Sud", "Rép. tchèque"] },
  { id: "B", teams: ["Canada", "Bosnie-Herzégovine", "Qatar", "Suisse"] },
  { id: "C", teams: ["Brésil", "Maroc", "Haïti", "Écosse"] },
  { id: "D", teams: ["États-Unis", "Paraguay", "Australie", "Turquie"] },
  { id: "E", teams: ["Allemagne", "Curaçao", "Côte d'Ivoire", "Équateur"] },
  { id: "F", teams: ["Pays-Bas", "Japon", "Suède", "Tunisie"] },
  { id: "G", teams: ["Belgique", "Égypte", "Iran", "Nouvelle-Zélande"] },
  { id: "H", teams: ["Espagne", "Cap-Vert", "Arabie Saoudite", "Uruguay"] },
  { id: "I", teams: ["France", "Sénégal", "Irak", "Norvège"] },
  { id: "J", teams: ["Argentine", "Algérie", "Autriche", "Jordanie"] },
  { id: "K", teams: ["Portugal", "RD Congo", "Ouzbékistan", "Colombie"] },
  { id: "L", teams: ["Angleterre", "Croatie", "Ghana", "Panama"] },
]

export const ALL_TEAMS: string[] = GROUPS.flatMap(g => g.teams).sort((a, b) =>
  a.localeCompare(b, 'fr')
)

export const FLAG_EMOJIS: Record<string, string> = {
  "Mexique": "🇲🇽", "Afrique du Sud": "🇿🇦", "Corée du Sud": "🇰🇷", "Rép. tchèque": "🇨🇿",
  "Canada": "🇨🇦", "Bosnie-Herzégovine": "🇧🇦", "Qatar": "🇶🇦", "Suisse": "🇨🇭",
  "Brésil": "🇧🇷", "Maroc": "🇲🇦", "Haïti": "🇭🇹", "Écosse": "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  "États-Unis": "🇺🇸", "Paraguay": "🇵🇾", "Australie": "🇦🇺", "Turquie": "🇹🇷",
  "Allemagne": "🇩🇪", "Curaçao": "🇨🇼", "Côte d'Ivoire": "🇨🇮", "Équateur": "🇪🇨",
  "Pays-Bas": "🇳🇱", "Japon": "🇯🇵", "Suède": "🇸🇪", "Tunisie": "🇹🇳",
  "Belgique": "🇧🇪", "Égypte": "🇪🇬", "Iran": "🇮🇷", "Nouvelle-Zélande": "🇳🇿",
  "Espagne": "🇪🇸", "Cap-Vert": "🇨🇻", "Arabie Saoudite": "🇸🇦", "Uruguay": "🇺🇾",
  "France": "🇫🇷", "Sénégal": "🇸🇳", "Irak": "🇮🇶", "Norvège": "🇳🇴",
  "Argentine": "🇦🇷", "Algérie": "🇩🇿", "Autriche": "🇦🇹", "Jordanie": "🇯🇴",
  "Portugal": "🇵🇹", "RD Congo": "🇨🇩", "Ouzbékistan": "🇺🇿", "Colombie": "🇨🇴",
  "Angleterre": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "Croatie": "🇭🇷", "Ghana": "🇬🇭", "Panama": "🇵🇦",
}

export const FLAG_COLORS: Record<string, string> = {
  "Mexique":            "linear-gradient(90deg, #006847 33%, #ffffff 33% 66%, #ce1126 66%)",
  "Afrique du Sud":     "linear-gradient(180deg, #007749 33%, #ffb612 33% 66%, #001489 66%)",
  "Corée du Sud":       "linear-gradient(180deg, #ffffff, #cd2e3a)",
  "Rép. tchèque":       "linear-gradient(180deg, #ffffff 50%, #d7141a 50%)",
  "Canada":             "linear-gradient(90deg, #ff0000 25%, #ffffff 25% 75%, #ff0000 75%)",
  "Bosnie-Herzégovine": "linear-gradient(135deg, #002395, #ffcc00)",
  "Qatar":              "linear-gradient(90deg, #ffffff 30%, #8a1538 30%)",
  "Suisse":             "linear-gradient(180deg, #d52b1e, #d52b1e)",
  "Brésil":             "linear-gradient(135deg, #009c3b 50%, #ffdf00 50%)",
  "Maroc":              "linear-gradient(180deg, #c1272d, #006233)",
  "Haïti":              "linear-gradient(180deg, #00209f 50%, #d21034 50%)",
  "Écosse":             "linear-gradient(135deg, #005eb8, #ffffff)",
  "États-Unis":         "linear-gradient(180deg, #b22234 50%, #3c3b6e 50%)",
  "Paraguay":           "linear-gradient(180deg, #d52b1e 33%, #ffffff 33% 66%, #0038a8 66%)",
  "Australie":          "linear-gradient(135deg, #012169, #e4002b)",
  "Turquie":            "linear-gradient(180deg, #e30a17, #e30a17)",
  "Allemagne":          "linear-gradient(180deg, #000000 33%, #dd0000 33% 66%, #ffce00 66%)",
  "Curaçao":            "linear-gradient(180deg, #002b7f 60%, #f9e814 60% 75%, #002b7f 75%)",
  "Côte d'Ivoire":      "linear-gradient(90deg, #ff8200 33%, #ffffff 33% 66%, #009e60 66%)",
  "Équateur":           "linear-gradient(180deg, #ffd100 50%, #0033a0 50% 75%, #ef3340 75%)",
  "Pays-Bas":           "linear-gradient(180deg, #ae1c28 33%, #ffffff 33% 66%, #21468b 66%)",
  "Japon":              "radial-gradient(circle at 50% 50%, #bc002d 0% 30%, #ffffff 30%)",
  "Suède":              "linear-gradient(135deg, #005ba6, #fecc00)",
  "Tunisie":            "linear-gradient(180deg, #e70013, #e70013)",
  "Belgique":           "linear-gradient(90deg, #000000 33%, #fae042 33% 66%, #ed2939 66%)",
  "Égypte":             "linear-gradient(180deg, #ce1126 33%, #ffffff 33% 66%, #000000 66%)",
  "Iran":               "linear-gradient(180deg, #239f40 33%, #ffffff 33% 66%, #da0000 66%)",
  "Nouvelle-Zélande":   "linear-gradient(135deg, #012169, #c8102e)",
  "Espagne":            "linear-gradient(180deg, #aa151b 25%, #f1bf00 25% 75%, #aa151b 75%)",
  "Cap-Vert":           "linear-gradient(180deg, #003893 60%, #ffffff 60% 75%, #cf2027 75%)",
  "Arabie Saoudite":    "linear-gradient(180deg, #006c35, #006c35)",
  "Uruguay":            "linear-gradient(180deg, #ffffff 50%, #0038a8 50%)",
  "France":             "linear-gradient(90deg, #002395 33%, #ffffff 33% 66%, #ed2939 66%)",
  "Sénégal":            "linear-gradient(90deg, #00853f 33%, #fdef42 33% 66%, #e31b23 66%)",
  "Irak":               "linear-gradient(180deg, #ce1126 33%, #ffffff 33% 66%, #000000 66%)",
  "Norvège":            "linear-gradient(135deg, #ef2b2d, #002868)",
  "Argentine":          "linear-gradient(180deg, #74acdf 35%, #ffffff 35% 65%, #74acdf 65%)",
  "Algérie":            "linear-gradient(90deg, #006633 50%, #ffffff 50%)",
  "Autriche":           "linear-gradient(180deg, #ed2939 33%, #ffffff 33% 66%, #ed2939 66%)",
  "Jordanie":           "linear-gradient(180deg, #000000 33%, #ffffff 33% 66%, #007a3d 66%)",
  "Portugal":           "linear-gradient(90deg, #006600 33%, #ff0000 33%)",
  "RD Congo":           "linear-gradient(135deg, #007fff, #f7d618)",
  "Ouzbékistan":        "linear-gradient(180deg, #0099b5 33%, #ffffff 33% 66%, #1eb53a 66%)",
  "Colombie":           "linear-gradient(180deg, #fcd116 50%, #003893 50% 75%, #ce1126 75%)",
  "Angleterre":         "linear-gradient(90deg, #ffffff 40%, #ce1124 40% 60%, #ffffff 60%)",
  "Croatie":            "linear-gradient(180deg, #ff0000 33%, #ffffff 33% 66%, #171796 66%)",
  "Ghana":              "linear-gradient(180deg, #ce1126 33%, #fcd116 33% 66%, #006b3f 66%)",
  "Panama":             "linear-gradient(135deg, #d21034, #005aa7)",
  "Italie":             "linear-gradient(90deg, #008c45 33%, #ffffff 33% 66%, #cd212a 66%)",
}

export const TEAM_EN_FR: Record<string, string> = {
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

export const MELTING_POT_FLAGS: MeltingPotFlag[] = [
  { c: "Brésil",            x: "4%",   y: "4%",   w: 130, h: 88, r: -8  },
  { c: "France",            x: "78%",  y: "3%",   w: 120, h: 80, r: 7   },
  { c: "Argentine",         x: "8%",   y: "82%",  w: 130, h: 88, r: 6   },
  { c: "Allemagne",         x: "80%",  y: "84%",  w: 130, h: 88, r: -9  },
  { c: "Espagne",           x: "42%",  y: "-2%",  w: 130, h: 88, r: 4   },
  { c: "Mexique",           x: "46%",  y: "92%",  w: 130, h: 88, r: -5  },
  { c: "Pays-Bas",          x: "-2%",  y: "44%",  w: 110, h: 80, r: -10 },
  { c: "États-Unis",        x: "88%",  y: "46%",  w: 130, h: 88, r: 8   },
  { c: "Japon",             x: "32%",  y: "32%",  w: 100, h: 70, r: 5   },
  { c: "Sénégal",           x: "66%",  y: "38%",  w: 120, h: 80, r: -6  },
  { c: "Angleterre",        x: "20%",  y: "52%",  w: 110, h: 75, r: 10  },
  { c: "Italie",            x: "70%",  y: "18%",  w: 110, h: 75, r: -7  },
  { c: "Belgique",          x: "6%",   y: "62%",  w: 110, h: 75, r: 6   },
  { c: "Croatie",           x: "84%",  y: "28%",  w: 100, h: 68, r: -8  },
  { c: "Portugal",          x: "30%",  y: "70%",  w: 100, h: 68, r: 9   },
  { c: "Maroc",             x: "60%",  y: "62%",  w: 110, h: 72, r: -5  },
  { c: "Canada",            x: "22%",  y: "16%",  w: 110, h: 75, r: -4  },
  { c: "Colombie",          x: "54%",  y: "48%",  w: 110, h: 72, r: 7   },
  { c: "Uruguay",           x: "14%",  y: "32%",  w: 100, h: 68, r: -8  },
  { c: "Suisse",            x: "44%",  y: "16%",  w: 80,  h: 80, r: 12  },
  { c: "Norvège",           x: "76%",  y: "58%",  w: 110, h: 75, r: 5   },
  { c: "Suède",             x: "0%",   y: "20%",  w: 110, h: 75, r: 8   },
  { c: "Corée du Sud",      x: "92%",  y: "12%",  w: 100, h: 68, r: -6  },
  { c: "Australie",         x: "60%",  y: "78%",  w: 110, h: 75, r: -10 },
  { c: "Égypte",            x: "38%",  y: "58%",  w: 100, h: 68, r: 6   },
  { c: "Côte d'Ivoire",     x: "84%",  y: "70%",  w: 110, h: 75, r: -6  },
  { c: "Ghana",             x: "16%",  y: "70%",  w: 100, h: 68, r: -8  },
  { c: "Cap-Vert",          x: "94%",  y: "0%",   w: 90,  h: 60, r: 10  },
  { c: "Algérie",           x: "92%",  y: "92%",  w: 100, h: 68, r: -8  },
  { c: "Iran",              x: "50%",  y: "30%",  w: 110, h: 72, r: 4   },
  { c: "Équateur",          x: "76%",  y: "0%",   w: 90,  h: 60, r: -12 },
  { c: "Panama",            x: "12%",  y: "0%",   w: 90,  h: 60, r: 10  },
  { c: "Turquie",           x: "62%",  y: "10%",  w: 100, h: 68, r: -8  },
  { c: "Autriche",          x: "0%",   y: "76%",  w: 100, h: 68, r: -3  },
  { c: "Paraguay",          x: "40%",  y: "82%",  w: 90,  h: 60, r: 8   },
  { c: "Tunisie",           x: "26%",  y: "92%",  w: 100, h: 68, r: -6  },
  { c: "Ouzbékistan",       x: "70%",  y: "92%",  w: 100, h: 68, r: 5   },
  { c: "Nouvelle-Zélande",  x: "54%",  y: "0%",   w: 100, h: 68, r: -4  },
  { c: "RD Congo",          x: "12%",  y: "44%",  w: 100, h: 68, r: 7   },
]
```

- [ ] **Step 2 : Créer `src/constants/bonus.ts`**

```typescript
import type { BonusType, BonusIcon } from '../types'

export const BONUS_TYPES: BonusType[] = [
  { id: "winner",    label: "Vainqueur du tournoi",                     points: 10, count: 1 },
  { id: "finalist",  label: "Finalistes (les 2)",                       points: 5,  count: 2 },
  { id: "semi",      label: "Demi-finalistes (les 4)",                  points: 3,  count: 4 },
  { id: "topscorer", label: "Meilleur buteur",                          points: 5,  count: 1 },
  { id: "surprise",  label: "Meilleure surprise (hors top 10 en demi)", points: 7,  count: 1 },
  { id: "upset",     label: "Favori éliminé en groupes",                points: 6,  count: 1 },
]

export const BONUS_ICONS: Record<string, BonusIcon> = {
  winner:    { icon: "🏆", bg: "linear-gradient(135deg, #f59e0b, #d97706)" },
  finalist:  { icon: "🥈", bg: "linear-gradient(135deg, #94a3b8, #475569)" },
  semi:      { icon: "🏟️", bg: "linear-gradient(135deg, #3b82f6, #1e3a8a)" },
  topscorer: { icon: "⚽", bg: "linear-gradient(135deg, #22c55e, #15803d)" },
  surprise:  { icon: "🎉", bg: "linear-gradient(135deg, #ec4899, #be185d)" },
  upset:     { icon: "💥", bg: "linear-gradient(135deg, #dc2626, #7f1d1d)" },
}
```

- [ ] **Step 3 : Créer `src/constants/ui.ts`**

```typescript
import type { ConfettiBit, KOStage } from '../types'

export const C = {
  bg: "#0a0e1a", card: "#111827", border: "#1e293b", accent: "#3b82f6",
  gold: "#f59e0b", silver: "#94a3b8", bronze: "#cd7c2f",
  text: "#f1f5f9", muted: "#64748b", green: "#22c55e", yellow: "#eab308",
  red: "#dc2626", blue: "#1e3a8a", whiteUS: "#f8fafc",
} as const

export const TABS = ["Participants", "Matchs", "Bonus", "Tableau", "Classement"] as const

export const KO_STAGES: KOStage[] = [
  { id: "r32",   label: "32èmes" },
  { id: "r16",   label: "16èmes" },
  { id: "qf",    label: "Quarts" },
  { id: "sf",    label: "Demies" },
  { id: "3rd",   label: "3e place" },
  { id: "final", label: "Finale" },
]

export const GROUP_IDS = ["A","B","C","D","E","F","G","H","I","J","K","L"] as const

export const CONFETTI_BITS: ConfettiBit[] = [
  { left: "8%",  delay: "0s",   dur: "3.2s", color: "#dc2626" },
  { left: "18%", delay: "0.6s", dur: "3.8s", color: "#f8fafc" },
  { left: "32%", delay: "1.2s", dur: "3.4s", color: "#1e3a8a" },
  { left: "48%", delay: "0.3s", dur: "4.0s", color: "#fbbf24" },
  { left: "62%", delay: "1.5s", dur: "3.0s", color: "#dc2626" },
  { left: "76%", delay: "0.9s", dur: "3.6s", color: "#1e3a8a" },
  { left: "88%", delay: "1.8s", dur: "3.2s", color: "#fbbf24" },
  { left: "94%", delay: "0.2s", dur: "3.9s", color: "#f8fafc" },
]

export const medalColors = ["#f59e0b", "#94a3b8", "#cd7c2f"] as const
export const medalIcons  = ["🥇", "🥈", "🥉"] as const

export const sCard  = { background: C.card, border: "1px solid " + C.border, borderRadius: "12px", padding: "14px", marginBottom: "10px" }
export const sInput = { background: "#1e293b", border: "1px solid " + C.border, borderRadius: "8px", color: C.text, padding: "8px 12px", fontFamily: "'Syne', sans-serif", fontSize: "13px", outline: "none", width: "100%" }
export const sLabel = { color: C.muted, fontSize: "11px", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: "6px", display: "block" }

export const BONUS_LOCK_DATE = new Date("2026-06-11T00:00:00Z")
```

- [ ] **Step 4 : Commit**

```bash
git add src/constants/
git commit -m "feat: add constants (teams, bonus, ui)"
```

---

## Task 4 : Utils

**Files:**
- Create: `src/utils/match.ts`
- Create: `src/utils/goals.ts`
- Create: `src/utils/ui.ts`

- [ ] **Step 1 : Créer `src/utils/goals.ts`**

```typescript
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
```

- [ ] **Step 2 : Créer `src/utils/match.ts`**

```typescript
import type { Match, Prono, MatchResult } from '../types'
import { parseGoals, goalsToText } from './goals'

export function calcMatchPoints(prono: Prono | undefined, result: MatchResult): number {
  if (!result || result.home === "" || result.away === "") return 0
  if (!prono || prono.home === "" || prono.away === "") return 0
  const ph = parseInt(prono.home), pa = parseInt(prono.away)
  const rh = parseInt(result.home), ra = parseInt(result.away)
  if (ph === rh && pa === ra) return 3
  if (Math.sign(ph - pa) === Math.sign(rh - ra)) return 1
  return 0
}

export function mapMatchRow(r: Record<string, unknown>): Match {
  const gh = (r.goals_home as unknown[] | null) || []
  const ga = (r.goals_away as unknown[] | null) || []
  return {
    id:        r.id as number,
    stage:     (r.stage as string) || "group",
    group:     (r.group_id as string) || null,
    home:      (r.home_team as string) || (r.home_label as string) || "?",
    away:      (r.away_team as string) || (r.away_label as string) || "?",
    homeKnown: !!(r.home_team),
    awayKnown: !!(r.away_team),
    homeLabel: (r.home_label as string) || "",
    awayLabel: (r.away_label as string) || "",
    result: {
      home: r.result_home !== null && r.result_home !== undefined ? String(r.result_home) : "",
      away: r.result_away !== null && r.result_away !== undefined ? String(r.result_away) : "",
      goalsHome: gh as import('../types').Goal[],
      goalsAway: ga as import('../types').Goal[],
      goalsHomeText: goalsToText(gh as import('../types').Goal[]),
      goalsAwayText: goalsToText(ga as import('../types').Goal[]),
    },
    matchDate: (r.match_date as string) || "",
    matchTime: (r.match_time as string) || "",
    venue:     (r.venue as string) || "",
    round:     (r.round as string) || "",
  }
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return ""
  const d = new Date(dateStr + "T12:00:00Z")
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
}

export function matchStartsAtMs(m: Match): number {
  if (!m.matchDate || !m.matchTime) return Infinity
  let found = m.matchTime.match(/^(\d{2}):(\d{2}):\d{2}([+-]\d+)/)
  if (!found) found = m.matchTime.match(/(\d{1,2}):(\d{2})\s*UTC([+-]\d+)/)
  if (!found) return Infinity
  const utcOffset = parseInt(found[3])
  const utcH = parseInt(found[1]) - utcOffset
  const d = new Date(m.matchDate + "T00:00:00Z")
  d.setUTCHours(utcH, parseInt(found[2]), 0, 0)
  return d.getTime()
}
```

- [ ] **Step 3 : Créer `src/utils/ui.ts`**

```typescript
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
```

- [ ] **Step 4 : Commit**

```bash
git add src/utils/
git commit -m "feat: add utils (match, goals, ui)"
```

---

## Task 5 : Client Supabase

**Files:**
- Create: `src/supabase.ts`

- [ ] **Step 1 : Créer `src/supabase.ts`**

```typescript
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL  = "https://sazupuqxwrnvgzsdxkjg.supabase.co"
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNhenVwdXF4d3Judmd6c2R4a2pnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNzc1MTEsImV4cCI6MjA5NDg1MzUxMX0.j2vQhrzFDDoaMV9i6CDIvF_9vpenDSFZ5julcjfXIBE"

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON)
```

- [ ] **Step 2 : Commit**

```bash
git add src/supabase.ts
git commit -m "feat: add Supabase client"
```

---

## Task 6 : Stores Pinia

**Files:**
- Create: `src/stores/auth.ts`
- Create: `src/stores/participants.ts`
- Create: `src/stores/matches.ts`
- Create: `src/stores/pronostics.ts`
- Create: `src/stores/bonus.ts`
- Create: `src/stores/admin.ts`
- Create: `src/stores/app.ts`

- [ ] **Step 1 : Créer `src/stores/auth.ts`**

```typescript
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Session } from '@supabase/supabase-js'
import { sb } from '../supabase'

export const useAuthStore = defineStore('auth', () => {
  const session      = ref<Session | null>(null)
  const profile      = ref<{ id: string; participant_id: number | null } | null>(null)
  const authMode     = ref<'login' | 'register'>('login')
  const authUsername = ref('')
  const authPassword = ref('')
  const authError    = ref('')
  const authLoading  = ref(false)

  async function doRegister() {
    authLoading.value = true; authError.value = ''
    try {
      const username = authUsername.value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '')
      if (username.length < 2) throw new Error("Le nom doit faire au moins 2 caractères (lettres, chiffres, _)")
      if (authPassword.value.length < 6) throw new Error("Le mot de passe doit faire au moins 6 caractères")
      const { data, error } = await sb.auth.signUp({ email: username + "@mfga.app", password: authPassword.value })
      if (error) {
        if (error.message.includes("already registered") || error.message.includes("already exists")) {
          authMode.value = 'login'
          throw new Error("Ce nom existe déjà — connecte-toi avec ton mot de passe.")
        }
        if (error.message.includes("rate limit")) throw new Error("Trop de tentatives, réessayez dans quelques minutes")
        throw error
      }
      if (data.user && !data.session) {
        authMode.value = 'login'
        throw new Error("Compte créé — connecte-toi avec ton mot de passe.")
      }
    } catch (e) {
      authError.value = (e as Error).message
    } finally {
      authLoading.value = false
    }
  }

  async function doLogin() {
    authLoading.value = true; authError.value = ''
    try {
      const username = authUsername.value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '')
      const { error } = await sb.auth.signInWithPassword({ email: username + "@mfga.app", password: authPassword.value })
      if (error) throw new Error("Nom d'utilisateur ou mot de passe incorrect")
    } catch (e) {
      authError.value = (e as Error).message
    } finally {
      authLoading.value = false
    }
  }

  function clearAuth() {
    session.value = null; profile.value = null
    authUsername.value = ''; authPassword.value = ''
  }

  return { session, profile, authMode, authUsername, authPassword, authError, authLoading, doRegister, doLogin, clearAuth }
})
```

- [ ] **Step 2 : Créer `src/stores/participants.ts`**

```typescript
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Participant } from '../types'

export const useParticipantsStore = defineStore('participants', () => {
  const participants = ref<Participant[]>([])
  return { participants }
})
```

- [ ] **Step 3 : Créer `src/stores/matches.ts`**

```typescript
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Match } from '../types'
import { sb } from '../supabase'
import { parseGoals } from '../utils/goals'

const writeTimers: Record<string, ReturnType<typeof setTimeout>> = {}

function debounce(key: string, fn: () => Promise<void>, delay = 600) {
  if (writeTimers[key]) clearTimeout(writeTimers[key])
  writeTimers[key] = setTimeout(fn, delay)
}

export const useMatchesStore = defineStore('matches', () => {
  const matches = ref<Match[]>([])

  function setMatchResult(matchId: number, side: 'home' | 'away', val: string) {
    matches.value = matches.value.map(m =>
      m.id !== matchId ? m : { ...m, result: { ...m.result, [side]: val } }
    )
    debounce("mr_" + matchId, async () => {
      const m = matches.value.find(x => x.id === matchId)
      if (!m) return
      await sb.from("matches").update({
        result_home: m.result.home === "" ? null : parseInt(m.result.home),
        result_away: m.result.away === "" ? null : parseInt(m.result.away),
        goals_home: m.result.goalsHome || [],
        goals_away: m.result.goalsAway || [],
      }).eq("id", matchId)
    })
  }

  function setMatchGoalText(matchId: number, side: 'home' | 'away', text: string) {
    const goals = parseGoals(text)
    const key = side === "home" ? "goalsHome" : "goalsAway"
    const textKey = side === "home" ? "goalsHomeText" : "goalsAwayText"
    matches.value = matches.value.map(m =>
      m.id !== matchId ? m : { ...m, result: { ...m.result, [key]: goals, [textKey]: text } }
    )
    debounce("mg_" + matchId, async () => {
      const m = matches.value.find(x => x.id === matchId)
      if (!m) return
      await sb.from("matches").update({
        goals_home: m.result.goalsHome || [],
        goals_away: m.result.goalsAway || [],
      }).eq("id", matchId)
    })
  }

  return { matches, setMatchResult, setMatchGoalText }
})
```

- [ ] **Step 4 : Créer `src/stores/pronostics.ts`**

```typescript
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Prono } from '../types'
import { sb } from '../supabase'

const writeTimers: Record<string, ReturnType<typeof setTimeout>> = {}

function debounce(key: string, fn: () => Promise<void>, delay = 600) {
  if (writeTimers[key]) clearTimeout(writeTimers[key])
  writeTimers[key] = setTimeout(fn, delay)
}

export const usePronosticsStore = defineStore('pronostics', () => {
  const pronostics = ref<Record<number, Record<number, Prono>>>({})
  const jokers     = ref<Record<number, number | null>>({})

  function setProno(pid: number, matchId: number, side: 'home' | 'away', val: string) {
    const cur = pronostics.value
    pronostics.value = { ...cur, [pid]: { ...cur[pid], [matchId]: { ...(cur[pid]?.[matchId] || {}), [side]: val } } }
    debounce("prono_" + pid + "_" + matchId, async () => {
      const prono = pronostics.value[pid]?.[matchId]
      if (!prono) return
      await sb.from("pronostics").upsert({
        participant_id: pid, match_id: matchId,
        prono_home: prono.home === "" ? null : parseInt(prono.home),
        prono_away: prono.away === "" ? null : parseInt(prono.away),
        is_joker: jokers.value[pid] === matchId,
      }, { onConflict: "participant_id,match_id" })
    })
  }

  async function toggleJoker(pid: number, matchId: number, currentProno: Prono | undefined) {
    const isCurrentJoker = jokers.value[pid] === matchId
    const oldJokerMatchId = jokers.value[pid]
    jokers.value = { ...jokers.value, [pid]: isCurrentJoker ? null : matchId }
    if (oldJokerMatchId && oldJokerMatchId !== matchId) {
      const oldProno = pronostics.value[pid]?.[oldJokerMatchId] || { home: '', away: '' }
      await sb.from("pronostics").upsert({
        participant_id: pid, match_id: oldJokerMatchId,
        prono_home: oldProno.home === "" ? null : parseInt(oldProno.home),
        prono_away: oldProno.away === "" ? null : parseInt(oldProno.away),
        is_joker: false,
      }, { onConflict: "participant_id,match_id" })
    }
    const prono = currentProno || { home: '', away: '' }
    await sb.from("pronostics").upsert({
      participant_id: pid, match_id: matchId,
      prono_home: prono.home === "" ? null : parseInt(prono.home),
      prono_away: prono.away === "" ? null : parseInt(prono.away),
      is_joker: !isCurrentJoker,
    }, { onConflict: "participant_id,match_id" })
  }

  return { pronostics, jokers, setProno, toggleJoker }
})
```

- [ ] **Step 5 : Créer `src/stores/bonus.ts`**

```typescript
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { sb } from '../supabase'

const writeTimers: Record<string, ReturnType<typeof setTimeout>> = {}

function debounce(key: string, fn: () => Promise<void>, delay = 600) {
  if (writeTimers[key]) clearTimeout(writeTimers[key])
  writeTimers[key] = setTimeout(fn, delay)
}

export const useBonusStore = defineStore('bonus', () => {
  const bonusPronostics = ref<Record<number, Record<string, string>>>({})
  const bonusResults    = ref<Record<string, string>>({})

  function setBonus(pid: number, bonusId: string, idx: number, val: string) {
    const key = bonusId + "_" + idx
    bonusPronostics.value = { ...bonusPronostics.value, [pid]: { ...bonusPronostics.value[pid], [key]: val } }
    debounce("bp_" + pid + "_" + key, async () => {
      await sb.from("bonus_pronostics").upsert({ participant_id: pid, bonus_key: key, value: val }, { onConflict: "participant_id,bonus_key" })
    })
  }

  function setBonusResult(bonusId: string, idx: number, val: string) {
    const key = bonusId + "_" + idx
    bonusResults.value = { ...bonusResults.value, [key]: val }
    debounce("br_" + key, async () => {
      await sb.from("bonus_results").upsert({ bonus_key: key, value: val }, { onConflict: "bonus_key" })
    })
  }

  return { bonusPronostics, bonusResults, setBonus, setBonusResult }
})
```

- [ ] **Step 6 : Créer `src/stores/admin.ts`**

```typescript
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { sb } from '../supabase'
import { TEAM_EN_FR } from '../constants/teams'
import { mapMatchRow } from '../utils/match'
import { useMatchesStore } from './matches'

export const useAdminStore = defineStore('admin', () => {
  const isAdmin        = ref(false)
  const showAdminModal = ref(false)
  const adminPassInput = ref('')
  const adminPassError = ref('')
  const showImportModal = ref(false)
  const importJsonText  = ref('')
  const importStatus    = ref('')
  const importLoading   = ref(false)

  function openAdminModal()  { showAdminModal.value = true; adminPassInput.value = ''; adminPassError.value = '' }
  function closeAdminModal() { showAdminModal.value = false }
  function submitAdminPass() {
    if (adminPassInput.value === "GOAT") { isAdmin.value = true; showAdminModal.value = false }
    else { adminPassError.value = "Mot de passe incorrect" }
  }
  function exitAdmin() { isAdmin.value = false }

  async function importJson() {
    const matchesStore = useMatchesStore()
    importLoading.value = true; importStatus.value = ''
    try {
      const data = JSON.parse(importJsonText.value)
      if (!data.matches) throw new Error("Champ 'matches' manquant")
      const pairMap: Record<string, import('../types').Match> = {}
      matchesStore.matches.filter(m => m.stage === "group").forEach(m => {
        pairMap[[m.home, m.away].sort().join("|")] = m
      })
      const upserts: Record<string, unknown>[] = []
      const mapG = (gs: { name: string; minute: number; penalty?: boolean; owngoal?: boolean }[] | undefined) =>
        (gs || []).map(g => ({ name: g.name, minute: g.minute, ...(g.penalty ? { penalty: true } : {}), ...(g.owngoal ? { owngoal: true } : {}) }))
      for (const jm of data.matches) {
        const row: Record<string, unknown> = { match_date: jm.date || null, match_time: jm.time || null, venue: jm.ground || null, round: jm.round || null }
        if (jm.num && jm.num >= 73) {
          row.id = jm.num
          if (jm.team1 && !/^\d/.test(jm.team1) && !/^[WL]/.test(jm.team1)) row.home_team = TEAM_EN_FR[jm.team1] || jm.team1
          if (jm.team2 && !/^\d/.test(jm.team2) && !/^[WL]/.test(jm.team2)) row.away_team = TEAM_EN_FR[jm.team2] || jm.team2
          if (jm.score?.ft) { row.result_home = jm.score.ft[0]; row.result_away = jm.score.ft[1] }
          if (jm.goals1 || jm.goals2) { row.goals_home = mapG(jm.goals1); row.goals_away = mapG(jm.goals2) }
        } else {
          if (!jm.team1 || !jm.team2) continue
          const frHome = TEAM_EN_FR[jm.team1] || jm.team1
          const frAway = TEAM_EN_FR[jm.team2] || jm.team2
          const m = pairMap[[frHome, frAway].sort().join("|")]
          if (!m) continue
          const flipped = m.home !== frHome
          row.id = m.id
          if (jm.score?.ft) {
            const [s1, s2] = jm.score.ft
            row.result_home = flipped ? s2 : s1; row.result_away = flipped ? s1 : s2
          }
          if (jm.goals1 || jm.goals2) {
            row.goals_home = flipped ? mapG(jm.goals2) : mapG(jm.goals1)
            row.goals_away = flipped ? mapG(jm.goals1) : mapG(jm.goals2)
          }
        }
        upserts.push(row)
      }
      if (!upserts.length) throw new Error("Aucun match reconnu")
      for (let i = 0; i < upserts.length; i += 20) {
        const { error } = await sb.from("matches").upsert(upserts.slice(i, i + 20), { onConflict: "id" })
        if (error) throw error
      }
      const { data: mData } = await sb.from("matches").select("*").order("id")
      matchesStore.matches = (mData || []).map(mapMatchRow)
      const withScore = upserts.filter(u => u.result_home !== null).length
      importStatus.value = `✓ ${upserts.length} matchs mis à jour (${withScore} avec score)`
      setTimeout(() => { showImportModal.value = false; importStatus.value = ''; importJsonText.value = '' }, 2000)
    } catch (e) {
      importStatus.value = "✗ " + (e as Error).message
    } finally {
      importLoading.value = false
    }
  }

  return { isAdmin, showAdminModal, adminPassInput, adminPassError, showImportModal, importJsonText, importStatus, importLoading, openAdminModal, closeAdminModal, submitAdminPass, exitAdmin, importJson }
})
```

- [ ] **Step 7 : Créer `src/stores/app.ts`**

```typescript
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { sb } from '../supabase'
import { mapMatchRow } from '../utils/match'
import { useAuthStore } from './auth'
import { useParticipantsStore } from './participants'
import { useMatchesStore } from './matches'
import { usePronosticsStore } from './pronostics'
import { useBonusStore } from './bonus'

export const useAppStore = defineStore('app', () => {
  const loaded   = ref(false)
  const saveMsg  = ref('')
  const rtStatus = ref('connecting')
  const tab      = ref(0)
  let realtimeChannel: ReturnType<typeof sb.channel> | null = null

  function flash() {
    saveMsg.value = "✓ Sauvegardé"
    setTimeout(() => { saveMsg.value = '' }, 2000)
  }

  async function loadData(userId: string) {
    const auth         = useAuthStore()
    const parts        = useParticipantsStore()
    const matchesStore = useMatchesStore()
    const pronos       = usePronosticsStore()
    const bonus        = useBonusStore()

    try {
      let { data: prof } = await sb.from("profiles").select("*").eq("id", userId).single()
      if (!prof) {
        await new Promise(r => setTimeout(r, 900))
        const { data: retry } = await sb.from("profiles").select("*").eq("id", userId).single()
        prof = retry
      }
      if (!prof) { auth.authError = "Profil introuvable. Contactez l'administrateur."; return }
      auth.profile = prof

      const [{ data: pData }, { data: mData }, { data: prData }, { data: brData }, { data: bpData }] = await Promise.all([
        sb.from("participants").select("*").order("id"),
        sb.from("matches").select("*").order("id"),
        sb.from("pronostics").select("*"),
        sb.from("bonus_results").select("*"),
        sb.from("bonus_pronostics").select("*"),
      ])

      parts.participants = (pData || []).map((p: Record<string, unknown>) => ({ id: p.id as number, name: p.name as string, color: p.color as string }))
      matchesStore.matches = (mData || []).map(mapMatchRow)

      const pronosMap: Record<number, Record<number, { home: string; away: string }>> = {}
      const jkrs: Record<number, number | null> = {}
      ;(prData || []).forEach((p: Record<string, unknown>) => {
        const pid = p.participant_id as number
        const mid = p.match_id as number
        if (!pronosMap[pid]) pronosMap[pid] = {}
        pronosMap[pid][mid] = {
          home: p.prono_home !== null && p.prono_home !== undefined ? String(p.prono_home) : "",
          away: p.prono_away !== null && p.prono_away !== undefined ? String(p.prono_away) : "",
        }
        if (p.is_joker) jkrs[pid] = mid
      })
      pronos.pronostics = pronosMap
      pronos.jokers = jkrs

      const bRes: Record<string, string> = {}
      ;(brData || []).forEach((r: Record<string, unknown>) => { bRes[r.bonus_key as string] = r.value as string })
      bonus.bonusResults = bRes

      const bPronos: Record<number, Record<string, string>> = {}
      ;(bpData || []).forEach((p: Record<string, unknown>) => {
        const pid = p.participant_id as number
        if (!bPronos[pid]) bPronos[pid] = {}
        bPronos[pid][p.bonus_key as string] = p.value as string
      })
      bonus.bonusPronostics = bPronos

      loaded.value = true
      startRealtime()
    } catch (_e) {
      auth.authError = "Erreur de chargement — vérifie ta connexion et recharge la page."
    }
  }

  function startRealtime() {
    const parts        = useParticipantsStore()
    const matchesStore = useMatchesStore()
    const pronos       = usePronosticsStore()
    const bonus        = useBonusStore()

    if (realtimeChannel) sb.removeChannel(realtimeChannel)
    realtimeChannel = sb.channel("mfga-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "participants" }, ({ eventType, new: n, old: o }: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }) => {
        if (eventType === "INSERT") {
          if (!parts.participants.find(x => x.id === n.id as number))
            parts.participants = [...parts.participants, { id: n.id as number, name: n.name as string, color: n.color as string }]
        } else if (eventType === "DELETE") {
          parts.participants = parts.participants.filter(x => x.id !== o.id as number)
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, ({ eventType, new: r }: { eventType: string; new: Record<string, unknown> }) => {
        if (eventType === "INSERT") {
          if (!matchesStore.matches.find(m => m.id === r.id as number))
            matchesStore.matches = [...matchesStore.matches, mapMatchRow(r)].sort((a, b) => a.id - b.id)
        } else if (eventType === "UPDATE") {
          matchesStore.matches = matchesStore.matches.map(m => m.id === r.id as number ? mapMatchRow(r) : m)
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "pronostics" }, ({ eventType, new: p }: { eventType: string; new: Record<string, unknown> }) => {
        if (eventType === "INSERT" || eventType === "UPDATE") {
          const pid = p.participant_id as number
          const mid = p.match_id as number
          pronos.pronostics = { ...pronos.pronostics, [pid]: { ...pronos.pronostics[pid], [mid]: {
            home: p.prono_home !== null ? String(p.prono_home) : "",
            away: p.prono_away !== null ? String(p.prono_away) : "",
          }}}
          const j = { ...pronos.jokers }
          if (p.is_joker) j[pid] = mid
          else if (j[pid] === mid) j[pid] = null
          pronos.jokers = j
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "bonus_results" }, ({ eventType, new: r }: { eventType: string; new: Record<string, unknown> }) => {
        if (eventType === "INSERT" || eventType === "UPDATE")
          bonus.bonusResults = { ...bonus.bonusResults, [r.bonus_key as string]: r.value as string }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "bonus_pronostics" }, ({ eventType, new: p }: { eventType: string; new: Record<string, unknown> }) => {
        if (eventType === "INSERT" || eventType === "UPDATE") {
          const pid = p.participant_id as number
          bonus.bonusPronostics = { ...bonus.bonusPronostics, [pid]: { ...bonus.bonusPronostics[pid], [p.bonus_key as string]: p.value as string } }
        }
      })
      .subscribe((status: string) => { rtStatus.value = status === "SUBSCRIBED" ? "connected" : "connecting" })
  }

  function stopRealtime() {
    if (realtimeChannel) { sb.removeChannel(realtimeChannel); realtimeChannel = null }
  }

  return { loaded, saveMsg, rtStatus, tab, flash, loadData, stopRealtime }
})
```

- [ ] **Step 8 : Commit**

```bash
git add src/stores/
git commit -m "feat: add Pinia stores (auth, app, matches, participants, pronostics, bonus, admin)"
```

---

## Task 7 : main.ts + App.vue

**Files:**
- Create: `src/main.ts`
- Create: `src/App.vue`

- [ ] **Step 1 : Créer `src/main.ts`**

```typescript
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'

const app = createApp(App)
app.use(createPinia())
app.mount('#app')
```

- [ ] **Step 2 : Créer `src/App.vue`**

Extraire le CSS global de `index.html` (lignes 1–278 de l'original) et le template racine :

```vue
<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { sb } from './supabase'
import { useAuthStore } from './stores/auth'
import { useAppStore } from './stores/app'
import { useAdminStore } from './stores/admin'
import { C } from './constants/ui'
import AuthScreen from './components/AuthScreen.vue'
import AppHeader from './components/AppHeader.vue'
import AdminModal from './components/modals/AdminModal.vue'
import ImportModal from './components/modals/ImportModal.vue'
import TabParticipants from './components/tabs/TabParticipants.vue'
import TabMatchs from './components/tabs/TabMatchs.vue'
import TabBonus from './components/tabs/TabBonus.vue'
import TabTableau from './components/tabs/TabTableau.vue'
import TabClassement from './components/tabs/TabClassement.vue'

const auth  = useAuthStore()
const app   = useAppStore()
const admin = useAdminStore()

onMounted(async () => {
  const { data: { session: existing } } = await sb.auth.getSession()
  if (existing) {
    auth.session = existing
    await app.loadData(existing.user.id)
  }

  sb.auth.onAuthStateChange(async (event, newSession) => {
    if (event === 'SIGNED_IN') {
      auth.session = newSession
      if (!app.loaded) await app.loadData(newSession!.user.id)
    } else if (event === 'TOKEN_REFRESHED') {
      auth.session = newSession
    } else if (event === 'SIGNED_OUT') {
      auth.session = null
      app.loaded = false
    }
  })
})

watch(() => auth.authMode, () => { auth.authError = '' })

async function doLogout() {
  app.stopRealtime()
  await sb.auth.signOut()
  auth.clearAuth()
  app.loaded = false
  app.tab = 0
}
</script>

<template>
  <div :style="{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'Syne, sans-serif' }">
    <AuthScreen v-if="!auth.session" />
    <template v-else-if="app.loaded">
      <AppHeader @logout="doLogout" />
      <div style="max-width: 480px; margin: 0 auto; padding: 0 12px 80px">
        <TabParticipants v-if="app.tab === 0" />
        <TabMatchs       v-else-if="app.tab === 1" />
        <TabBonus        v-else-if="app.tab === 2" />
        <TabTableau      v-else-if="app.tab === 3" />
        <TabClassement   v-else-if="app.tab === 4" />
      </div>
      <AdminModal  v-if="admin.showAdminModal" />
      <ImportModal v-if="admin.showImportModal" />
    </template>
    <div v-else :style="{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: C.muted }">
      Chargement…
    </div>
  </div>
</template>

<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #0a0e1a; }
input, select, textarea { box-sizing: border-box; }

/* — Copiés depuis index.html — */
@keyframes confetti-fall {
  0%   { transform: translateY(-10px) rotate(0deg);   opacity: 1; }
  100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
}
.confetti-bit { position: fixed; width: 8px; height: 8px; border-radius: 2px; animation: confetti-fall linear infinite; pointer-events: none; z-index: 9999; }
@keyframes ball-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
.ball-spin { animation: ball-spin 3s linear infinite; }
@keyframes live-pulse { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
.live-dot { width: 7px; height: 7px; border-radius: 50%; background: #22c55e; display: inline-block; animation: live-pulse 1.4s ease-in-out infinite; }
.flag-melting-pot { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.flag-tile { position: absolute; opacity: 0.13; border-radius: 4px; }
.card-rel { position: relative; overflow: hidden; }
.anton { font-family: 'Anton', sans-serif; }
.ribbon { font-family: 'Anton', sans-serif; font-size: 11px; color: #fff; padding: 3px 10px; border-radius: 4px; letter-spacing: 1.5px; }
.wc-mark { font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.title-mfga { font-family: 'Anton', sans-serif; font-size: 36px; line-height: 0.95; letter-spacing: 1px; color: #f8fafc; text-shadow: 0 1px 0 #1e3a8a, 0 2px 0 #1e3a8a, 0 3px 0 #991b1b, 0 4px 6px rgba(0,0,0,0.6); }
.title-red  { color: #fca5a5; }
.title-blue { color: #93c5fd; }
.team-block { position: relative; flex: 1; display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-radius: 8px; overflow: hidden; min-width: 0; }
.team-block .flag-bg { position: absolute; inset: 0; opacity: 0.22; }
.team-block .name { position: relative; z-index: 1; font-weight: 700; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0; }
.vs-chunk { font-family: 'Anton', sans-serif; font-size: 11px; color: #475569; letter-spacing: 1px; padding: 0 4px; }
.podium-step { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; border-radius: 8px 8px 0 0; padding: 10px 8px 6px; }
.podium-step.gold   { background: linear-gradient(180deg, rgba(245,158,11,0.25), rgba(245,158,11,0.08)); border: 1px solid rgba(245,158,11,0.4); }
.podium-step.silver { background: linear-gradient(180deg, rgba(148,163,184,0.2), rgba(148,163,184,0.06)); border: 1px solid rgba(148,163,184,0.3); }
.podium-step.bronze { background: linear-gradient(180deg, rgba(205,124,47,0.2), rgba(205,124,47,0.06)); border: 1px solid rgba(205,124,47,0.3); }
.avatar-disc { border-radius: 50%; display: flex; align-items: center; justify-content: center; font-family: 'Anton', sans-serif; color: #fff; }
.p-name { font-size: 10px; font-weight: 700; color: #94a3b8; text-align: center; margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 70px; }
.p-pts  { font-family: 'Anton', sans-serif; font-size: 16px; }
.bonus-header { display: flex; align-items: center; gap: 12px; padding: 12px 14px; margin: 0 0 14px; border-radius: 10px 10px 0 0; }
.bonus-icon-box { width: 38px; height: 38px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; box-shadow: 0 2px 4px rgba(0,0,0,0.4); }
.podium { display: flex; align-items: flex-end; justify-content: center; gap: 8px; padding: 20px 10px 0; }
.tab-bar { display: flex; gap: 4px; margin-top: 4px; }

@media (max-width: 480px) {
  .title-mfga { font-size: 26px !important; }
  .header-quote { display: none !important; }
  .header-mascot img { width: 110px !important; height: auto !important; }
  .header-hero-row { gap: 8px !important; }
  .header-hosts { flex-wrap: wrap !important; gap: 6px !important; margin-top: -4px !important; }
  .topbar-right { gap: 6px !important; flex-wrap: wrap; justify-content: flex-end; }
  .wc-mark { font-size: 10px !important; letter-spacing: 1px !important; white-space: nowrap; }
  .tab-bar { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .tab-bar button { font-size: 11px !important; padding: 8px 10px !important; white-space: nowrap; }
  .header-tagline { display: none !important; }
}
</style>
```

- [ ] **Step 3 : Vérifier que `npm run dev` démarre sans erreur TS**

```bash
npm run dev
```

Expected: `VITE v5.x  ready in Xms → Local: http://localhost:5173/mfga/` — écran de chargement visible dans le navigateur.

- [ ] **Step 4 : Commit**

```bash
git add src/main.ts src/App.vue
git commit -m "feat: add main.ts and App.vue root"
```

---

## Task 8 : AuthScreen.vue

**Files:**
- Create: `src/components/AuthScreen.vue`

Extraire le bloc `v-if="!session"` de `index.html` (lignes 1035–1101 de l'original).

- [ ] **Step 1 : Créer `src/components/AuthScreen.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useAuthStore } from '../stores/auth'
import { C, CONFETTI_BITS } from '../constants/ui'
import { FLAG_COLORS, MELTING_POT_FLAGS } from '../constants/teams'

const auth = useAuthStore()
const sInput = { background: "#1e293b", border: "1px solid #1e293b", borderRadius: "8px", color: C.text, padding: "10px 14px", fontFamily: "'Syne', sans-serif", fontSize: "14px", outline: "none", width: "100%" }
const sLabel = { color: C.muted, fontSize: "11px", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: "6px", display: "block" }

const isLogin = computed(() => auth.authMode === 'login')
</script>

<template>
  <div :style="{ minHeight: '100vh', color: C.text, fontFamily: 'Syne, sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', position: 'relative' }">
    <div class="flag-melting-pot">
      <div v-for="(f, i) in MELTING_POT_FLAGS" :key="i" class="flag-tile"
        :style="{ left: f.x, top: f.y, width: f.w + 'px', height: f.h + 'px', background: FLAG_COLORS[f.c] || '#475569', transform: 'rotate(' + f.r + 'deg)' }">
      </div>
    </div>
    <div v-for="(b, i) in CONFETTI_BITS" :key="i" class="confetti-bit"
      :style="{ left: b.left, animationDelay: b.delay, animationDuration: b.dur, background: b.color }">
    </div>
    <div style="position: relative; z-index: 1; width: 100%; max-width: 360px">
      <div style="text-align: center; margin-bottom: 32px">
        <div class="title-mfga">MAKE <span class="title-red">FOOTBALL</span></div>
        <div class="title-mfga">GOAT <span class="title-blue">AGAIN</span> <span style="font-size:32px">🐐</span></div>
        <div style="color: #fca5a5; font-size: 11px; font-weight: 600; margin-top: 6px; letter-spacing: 0.5px">★ Pronostics non-officiels · 100 % bipartisan ★</div>
      </div>
      <div :style="{ background: C.card, border: '1px solid ' + C.border, borderRadius: '14px', padding: '24px 20px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }">
        <div style="display: flex; gap: 0; margin-bottom: 20px; border-radius: 8px; overflow: hidden; border: 1px solid #1e293b">
          <button @click="auth.authMode = 'login'"
            :style="{ flex: 1, padding: '10px', border: 'none', cursor: 'pointer', fontFamily: 'Anton, sans-serif', fontSize: '13px', letterSpacing: '1px', background: isLogin ? '#dc2626' : '#1e293b', color: isLogin ? '#fff' : C.muted }">
            SE CONNECTER
          </button>
          <button @click="auth.authMode = 'register'"
            :style="{ flex: 1, padding: '10px', border: 'none', cursor: 'pointer', fontFamily: 'Anton, sans-serif', fontSize: '13px', letterSpacing: '1px', background: !isLogin ? '#1e3a8a' : '#1e293b', color: !isLogin ? '#fff' : C.muted }">
            S'INSCRIRE
          </button>
        </div>
        <div style="margin-bottom: 14px">
          <label :style="sLabel">Nom d'utilisateur</label>
          <input :style="sInput" type="text" placeholder="ex: jeremy" :value="auth.authUsername"
            @input="auth.authUsername = ($event.target as HTMLInputElement).value"
            @keydown.enter="isLogin ? auth.doLogin() : auth.doRegister()" />
        </div>
        <div style="margin-bottom: 18px">
          <label :style="sLabel">Mot de passe</label>
          <input :style="sInput" type="password" placeholder="••••••••" :value="auth.authPassword"
            @input="auth.authPassword = ($event.target as HTMLInputElement).value"
            @keydown.enter="isLogin ? auth.doLogin() : auth.doRegister()" />
        </div>
        <div v-if="auth.authError" style="color: #ef4444; font-size: 12px; margin-bottom: 12px; padding: 8px 12px; background: rgba(239,68,68,0.1); border-radius: 6px; border: 1px solid rgba(239,68,68,0.3)">
          {{ auth.authError }}
        </div>
        <button @click="isLogin ? auth.doLogin() : auth.doRegister()"
          :disabled="auth.authLoading"
          :style="{ width: '100%', padding: '12px', border: 'none', borderRadius: '8px', cursor: auth.authLoading ? 'not-allowed' : 'pointer', fontFamily: 'Anton, sans-serif', fontSize: '15px', letterSpacing: '1.5px', color: '#fff', background: isLogin ? 'linear-gradient(135deg, #dc2626, #991b1b)' : 'linear-gradient(135deg, #1e3a8a, #1d4ed8)', opacity: auth.authLoading ? 0.7 : 1 }">
          {{ auth.authLoading ? '...' : (isLogin ? 'ENTRER' : 'CRÉER MON COMPTE') }}
        </button>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2 : Vérifier dans le navigateur**

Ouvrir `http://localhost:5173/mfga/` — l'écran de login doit s'afficher avec le fond de drapeaux et les confettis.

- [ ] **Step 3 : Commit**

```bash
git add src/components/AuthScreen.vue
git commit -m "feat: add AuthScreen component"
```

---

## Task 9 : AppHeader.vue

**Files:**
- Create: `src/components/AppHeader.vue`

Extraire le bloc header de l'original (lignes 1119–1175).

- [ ] **Step 1 : Créer `src/components/AppHeader.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useAppStore } from '../stores/app'
import { useAdminStore } from '../stores/admin'
import { C, TABS } from '../constants/ui'

const emit = defineEmits<{ logout: [] }>()
const auth  = useAuthStore()
const app   = useAppStore()
const admin = useAdminStore()

const rtColor = computed(() => app.rtStatus === 'connected' ? C.green : C.yellow)

function tabStyle(active: boolean) {
  return { padding: "10px 16px", background: active ? "#dc2626" : "transparent", color: active ? "#fff" : C.muted, border: "none", borderRadius: "8px 8px 0 0", cursor: "pointer", fontFamily: "'Anton', sans-serif", fontSize: "14px", letterSpacing: "1.2px", textTransform: "uppercase" as const, borderBottom: active ? "3px solid #1e3a8a" : "3px solid transparent" }
}
</script>

<template>
  <div :style="{ background: 'linear-gradient(180deg, #0f172a 0%, #0a0e1a 100%)', borderBottom: '1px solid ' + C.border, padding: '10px 12px 0', position: 'sticky', top: 0, zIndex: 100, maxWidth: '480px', margin: '0 auto' }">
    <!-- Top bar -->
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px">
      <div style="display: flex; align-items: center; gap: 8px">
        <span class="dot" style="background: #dc2626"></span>
        <span class="dot" style="background: #1e3a8a"></span>
        <span class="wc-mark" style="color: #f8fafc; letter-spacing: 2px">WORLD CUP&nbsp;2026</span>
      </div>
      <div class="topbar-right" style="display: flex; align-items: center; gap: 12px">
        <div style="display: flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase"
          :style="{ color: app.saveMsg ? '#22c55e' : (app.rtStatus === 'connected' ? '#22c55e' : '#eab308') }">
          <span :class="app.rtStatus === 'connected' ? 'live-dot' : ''"
            :style="{ width: '7px', height: '7px', borderRadius: '50%', background: rtColor, display: 'inline-block' }"></span>
          {{ app.saveMsg || (app.rtStatus === 'connected' ? 'EN DIRECT' : 'CONNEXION…') }}
        </div>
        <span style="color: #475569; font-size: 11px">👤 {{ auth.profile?.username ?? '' }}</span>
        <template v-if="admin.isAdmin">
          <span style="background: rgba(220,38,38,0.2); color: #fca5a5; border: 1px solid rgba(220,38,38,0.35); border-radius: 6px; padding: 2px 8px; font-size: 10px; font-weight: 700; letter-spacing: 1px">ADMIN</span>
          <button @click="admin.exitAdmin" style="background: #7f1d1d; color: #fca5a5; border: 1px solid rgba(220,38,38,0.35); border-radius: 6px; padding: 4px 10px; cursor: pointer; font-family: Syne, sans-serif; font-size: 11px">Exit</button>
        </template>
        <button v-else @click="admin.openAdminModal" style="background: #1e293b; color: #64748b; border: 1px solid #334155; border-radius: 6px; padding: 4px 10px; cursor: pointer; font-family: Syne, sans-serif; font-size: 11px">Admin</button>
        <button @click="emit('logout')" title="Se déconnecter" style="background: #1e293b; color: #94a3b8; border: 1px solid #334155; border-radius: 6px; padding: 4px 7px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- Mascot + title -->
    <div class="header-hero-row" style="display: flex; align-items: flex-end; gap: 14px; margin-bottom: 12px">
      <div style="flex: 1; min-width: 0; align-self: center">
        <div class="title-mfga">MAKE <span class="title-red">FOOTBALL</span></div>
        <div class="title-mfga" style="margin-top: 2px">GOAT <span class="title-blue">AGAIN</span> <span style="font-size: 32px">🐐</span></div>
        <div class="header-tagline" style="color: #fca5a5; font-size: 11px; font-weight: 600; margin-top: 4px; letter-spacing: 0.5px">★ Pronostics non-officiels · 100 % bipartisan ★</div>
      </div>
      <div class="header-mascot" style="flex-shrink: 0; position: relative; align-self: flex-end">
        <img src="/assets/mascot.png" alt="MFGA Goat" width="180" height="153"
          style="display: block; filter: drop-shadow(0 8px 16px rgba(0,0,0,0.7))" />
      </div>
      <div class="header-quote" style="flex-shrink: 0; max-width: 155px; align-self: center; border-left: 2px solid rgba(220,38,38,0.5); padding-left: 10px">
        <div style="font-size: 9.5px; color: #94a3b8; font-style: italic; line-height: 1.5; letter-spacing: 0.2px">
          « La compét' d'Infantino, bénie par Trump, gagné par les chèvres »
        </div>
      </div>
    </div>

    <!-- Host countries -->
    <div class="header-hosts" style="display: flex; align-items: center; gap: 10px; margin-top: -22px; margin-bottom: 12px; font-size: 11px; color: #cbd5e1; font-weight: 600">
      <span style="color: #64748b; letter-spacing: 1px; text-transform: uppercase; font-size: 10px">Pays hôtes</span>
      <span style="display: inline-flex; align-items: center; gap: 4px; background: rgba(220,38,38,0.18); border: 1px solid rgba(220,38,38,0.4); padding: 2px 8px; border-radius: 4px">🇺🇸 USA</span>
      <span style="display: inline-flex; align-items: center; gap: 4px; background: rgba(220,38,38,0.18); border: 1px solid rgba(220,38,38,0.4); padding: 2px 8px; border-radius: 4px">🇨🇦 Canada</span>
      <span style="display: inline-flex; align-items: center; gap: 4px; background: rgba(220,38,38,0.18); border: 1px solid rgba(220,38,38,0.4); padding: 2px 8px; border-radius: 4px">🇲🇽 Mexico</span>
    </div>

    <!-- Tabs -->
    <div class="tab-bar">
      <button v-for="(t, i) in TABS" :key="i" :style="tabStyle(app.tab === i)" @click="app.tab = i">{{ t }}</button>
    </div>
  </div>
</template>
```

- [ ] **Step 2 : Commit**

```bash
git add src/components/AppHeader.vue
git commit -m "feat: add AppHeader component"
```

---

## Task 10 : Composants Tab — extraction du template

Pour chaque tab ci-dessous, la stratégie est : copier le bloc `<div v-if="tab === N">` depuis `index.html.bak`, remplacer toutes les références aux variables du setup Vue 2 (`matches`, `pronostics`, etc.) par des imports des stores Pinia correspondants.

**Variables → stores :**

| Variable originale | Store / import |
|--------------------|---------------|
| `matches` | `useMatchesStore().matches` |
| `participants` | `useParticipantsStore().participants` |
| `pronostics` | `usePronosticsStore().pronostics` |
| `jokers` | `usePronosticsStore().jokers` |
| `bonusPronostics` | `useBonusStore().bonusPronostics` |
| `bonusResults` | `useBonusStore().bonusResults` |
| `isAdmin` | `useAdminStore().isAdmin` |
| `activeGroup` | local `ref` dans TabMatchs |
| `activeKOStage` | local `ref` dans TabMatchs |
| `activeStageType` | local `ref` dans TabMatchs |
| `activeParticipant` | local `ref` dans TabParticipants/TabMatchs |
| `tab` | `useAppStore().tab` |
| `profile` | `useAuthStore().profile` |
| `canEditResult` | `computed(() => adminStore.isAdmin)` |
| `canEditProno` | `computed(() => adminStore.isAdmin \|\| activeParticipant === myParticipantId)` |
| `canEditMatchProno(id)` | fonction locale utilisant `matchStartsAtMs` + `now` |
| `bonusLocked` | `computed(() => new Date() >= BONUS_LOCK_DATE)` |
| `canEditBonusResult` | `computed(() => adminStore.isAdmin && !bonusLocked)` |
| `myParticipantId` | `computed(() => auth.profile?.participant_id)` |
| `rankings` | `computed(...)` local dans TabClassement |
| `calcScore` | fonction locale dans TabClassement |

**Files:**
- Create: `src/components/tabs/TabParticipants.vue`
- Create: `src/components/tabs/TabMatchs.vue`
- Create: `src/components/tabs/TabBonus.vue`
- Create: `src/components/tabs/TabTableau.vue`
- Create: `src/components/tabs/TabClassement.vue`

- [ ] **Step 1 : Créer `src/components/tabs/TabTableau.vue`** (le plus simple)

```vue
<script setup lang="ts">
import { C } from '../../constants/ui'
</script>

<template>
  <div :style="{ background: C.card, border: '1px solid #1e293b', borderRadius: '12px', padding: '12px', textAlign: 'center', marginTop: '10px' }">
    <div class="anton" style="font-size: 14px; color: #fbbf24; letter-spacing: 1px; margin-bottom: 10px">TABLEAU DE LA PHASE FINALE</div>
    <img src="/assets/tableau.png" alt="Tableau phase finale CdM 2026"
      style="width: 100%; max-width: 700px; border-radius: 8px; display: block; margin: 0 auto" />
    <div style="font-size: 10px; color: #475569; margin-top: 8px">Source : FIFA / AFP</div>
  </div>
</template>
```

- [ ] **Step 2 : Créer `src/components/tabs/TabParticipants.vue`**

Extraire le bloc TAB 0 de l'original (lignes 1193–1262). Adapter les variables :

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useParticipantsStore } from '../../stores/participants'
import { useMatchesStore } from '../../stores/matches'
import { usePronosticsStore } from '../../stores/pronostics'
import { useAdminStore } from '../../stores/admin'
import { useAuthStore } from '../../stores/auth'
import { C, sCard, medalColors, medalIcons } from '../../constants/ui'
import { calcMatchPoints } from '../../utils/match'
import { initials } from '../../utils/ui'

const parts   = useParticipantsStore()
const matches = useMatchesStore()
const pronos  = usePronosticsStore()
const admin   = useAdminStore()
const auth    = useAuthStore()

function matchesPlayedCount() {
  return matches.matches.filter(m => m.result.home !== "" && m.result.away !== "").length
}

function pronoCompletion(pid: number) {
  const total = matches.matches.length
  if (!total) return { filled: 0, total: 0, pct: 0 }
  const filled = matches.matches.filter(m => {
    const p = pronos.pronostics[pid]?.[m.id]
    return p && p.home !== "" && p.away !== ""
  }).length
  return { filled, total, pct: Math.round(filled / total * 100) }
}

function calcScore(pid: number) {
  let total = 0, exactCount = 0, diagCount = 0
  matches.matches.forEach(m => {
    if (m.result.home === "" || m.result.away === "") return
    const pts = calcMatchPoints(pronos.pronostics[pid]?.[m.id], m.result)
    if (pts === 3) exactCount++
    else if (pts === 1) diagCount++
    total += pronos.jokers[pid] === m.id ? pts * 2 : pts
  })
  return { total, exactCount, diagCount }
}

const rankings = computed(() =>
  parts.participants.map(p => ({ ...p, ...calcScore(p.id) }))
    .sort((a, b) => b.total - a.total || b.exactCount - a.exactCount)
)

function badgeStyle(color: string) {
  return { background: color + "22", color, border: "1px solid " + color + "44", borderRadius: "6px", padding: "2px 8px", fontSize: "12px", fontWeight: 700 }
}
</script>

<template>
  <!-- Copier le contenu du bloc TAB 0 de index.html.bak ici, en remplaçant :
       - participants  → parts.participants
       - rankings      → rankings
       - matchesPlayedCount() → matchesPlayedCount()
       - pronoCompletion(p.id) → pronoCompletion(p.id)
       - isAdmin       → admin.isAdmin
       - profile       → auth.profile
       - C, sCard, medalColors, medalIcons → importés
       - initials()    → initials()
  -->
  <div><!-- contenu extrait de index.html.bak TAB 0 --></div>
</template>
```

**Note :** les étapes 3, 4, 5 ci-dessous suivent le même pattern — extraire le HTML de l'onglet correspondant dans `index.html.bak` et remplacer les variables selon le tableau ci-dessus.

- [ ] **Step 3 : Créer `src/components/tabs/TabMatchs.vue`**

Extraire TAB 1 (lignes 1263–1606). Variables locales à ajouter dans `<script setup>` :
- `const activeGroup = ref('A')`
- `const activeStageType = ref<'group' | 'knockout'>('group')`
- `const activeKOStage = ref('r32')`
- `const activeParticipant = ref<number | null>(null)` (initialisé depuis `auth.profile?.participant_id`)
- `const now = ref(Date.now())` + `setInterval(() => { now.value = Date.now() }, 30000)`
- `const myParticipantId = computed(() => auth.profile?.participant_id ?? null)`
- `const canEditProno = computed(() => admin.isAdmin || activeParticipant.value === myParticipantId.value)`
- `const canEditResult = computed(() => admin.isAdmin)`
- `function matchStartsAtMs(m)` — copier depuis `utils/match.ts`
- `function hasMatchStarted(m)` — `return now.value >= matchStartsAtMs(m)`
- `function canEditMatchProno(matchId)` — copier depuis l'original
- `const groupMatches = computed(...)` — filtrer sur stage/group
- `const koStageMatches = computed(...)` — filtrer sur KO stage
- `const hasKOMatches = computed(...)` — vérifier stage !== 'group'

- [ ] **Step 4 : Créer `src/components/tabs/TabBonus.vue`**

Extraire TAB 2 (lignes 1607–1701). Variables locales :
- `const myParticipantId = computed(() => auth.profile?.participant_id ?? null)`
- `function isMe(pid)` — `return pid === myParticipantId.value`
- `const bonusLocked = computed(() => new Date() >= BONUS_LOCK_DATE)`
- `const canEditBonusResult = computed(() => admin.isAdmin && !bonusLocked.value)`
- `function isBonusCorrect(pid, key)` + `function isBonusWrong(pid, key)` — copier depuis l'original
- `function getBonusIcon(id)` — copier depuis l'original

- [ ] **Step 5 : Créer `src/components/tabs/TabClassement.vue`**

Extraire TAB 4 (lignes 1713–1821). Variables locales :
- `function calcScore(pid)` — identique à TabParticipants
- `const rankings = computed(...)` — identique à TabParticipants
- `function matchPtsForRanking(pid)` — copier depuis l'original
- `function matchesPlayedCount()` — copier depuis l'original

- [ ] **Step 6 : Vérifier dans le navigateur**

Se connecter avec `jeremy` / `Coco35`. Vérifier que les 5 tabs s'affichent et que les données se chargent.

- [ ] **Step 7 : Commit**

```bash
git add src/components/tabs/
git commit -m "feat: add tab components (Participants, Matchs, Bonus, Tableau, Classement)"
```

---

## Task 11 : Modals

**Files:**
- Create: `src/components/modals/AdminModal.vue`
- Create: `src/components/modals/ImportModal.vue`

- [ ] **Step 1 : Créer `src/components/modals/AdminModal.vue`**

Extraire le bloc modal admin de l'original (lignes 1826–1851) :

```vue
<script setup lang="ts">
import { useAdminStore } from '../../stores/admin'
import { C, sInput, sLabel } from '../../constants/ui'

const admin = useAdminStore()
</script>

<template>
  <div style="position: fixed; inset: 0; background: rgba(0,0,0,0.78); z-index: 200; display: flex; align-items: center; justify-content: center"
    @click.self="admin.closeAdminModal">
    <div style="background: #111827; border: 1px solid #1e293b; border-radius: 14px; padding: 28px 24px; width: 300px; max-width: 90vw">
      <div class="anton" style="font-size: 18px; color: #fbbf24; letter-spacing: 1.5px; margin-bottom: 4px; text-align: center">⚙ MODE ADMIN</div>
      <div style="font-size: 11px; color: #64748b; text-align: center; margin-bottom: 18px">Accès en écriture sur toutes les données</div>
      <div :style="sLabel">Mot de passe</div>
      <input :style="{ ...sInput, marginBottom: '12px' }" type="password" placeholder="••••••••"
        :value="admin.adminPassInput"
        @input="admin.adminPassInput = ($event.target as HTMLInputElement).value"
        @keydown.enter="admin.submitAdminPass" />
      <div v-if="admin.adminPassError" style="color: #ef4444; font-size: 12px; margin-bottom: 10px">{{ admin.adminPassError }}</div>
      <div style="display: flex; gap: 8px; margin-top: 4px">
        <button @click="admin.closeAdminModal" style="flex: 1; background: #1e293b; color: #94a3b8; border: 1px solid #334155; border-radius: 8px; padding: 9px; cursor: pointer; font-family: Syne, sans-serif; font-size: 13px; font-weight: 600">Annuler</button>
        <button @click="admin.submitAdminPass" style="flex: 1; background: #dc2626; color: #fff; border: none; border-radius: 8px; padding: 9px; cursor: pointer; font-family: Anton, sans-serif; font-size: 13px; letter-spacing: 1px">ENTRER</button>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2 : Créer `src/components/modals/ImportModal.vue`**

Extraire le bloc modal import de l'original (lignes 1853–1875) :

```vue
<script setup lang="ts">
import { useAdminStore } from '../../stores/admin'
import { C, sInput, sLabel } from '../../constants/ui'

const admin = useAdminStore()
</script>

<template>
  <div style="position: fixed; inset: 0; background: rgba(0,0,0,0.78); z-index: 200; display: flex; align-items: center; justify-content: center"
    @click.self="admin.showImportModal = false">
    <div style="background: #111827; border: 1px solid #1e293b; border-radius: 14px; padding: 24px 20px; width: 420px; max-width: 95vw">
      <div class="anton" style="font-size: 16px; color: #fbbf24; letter-spacing: 1.5px; margin-bottom: 12px">📥 IMPORT JSON</div>
      <div :style="sLabel">Coller le JSON football-data.org</div>
      <textarea :style="{ ...sInput, height: '160px', resize: 'vertical', fontFamily: 'monospace', fontSize: '11px', marginBottom: '12px' }"
        :value="admin.importJsonText"
        @input="admin.importJsonText = ($event.target as HTMLTextAreaElement).value"
        placeholder='{ "matches": [...] }'>
      </textarea>
      <div v-if="admin.importStatus" :style="{ color: admin.importStatus.startsWith('✓') ? '#22c55e' : '#ef4444', fontSize: '12px', marginBottom: '10px' }">
        {{ admin.importStatus }}
      </div>
      <div style="display: flex; gap: 8px">
        <button @click="admin.showImportModal = false" style="flex: 1; background: #1e293b; color: #94a3b8; border: 1px solid #334155; border-radius: 8px; padding: 9px; cursor: pointer; font-family: Syne, sans-serif; font-size: 13px">Annuler</button>
        <button @click="admin.importJson" :disabled="admin.importLoading" style="flex: 1; background: #1e3a8a; color: #fff; border: none; border-radius: 8px; padding: 9px; cursor: pointer; font-family: Anton, sans-serif; font-size: 13px; letter-spacing: 1px">
          {{ admin.importLoading ? '...' : 'IMPORTER' }}
        </button>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 3 : Commit**

```bash
git add src/components/modals/
git commit -m "feat: add AdminModal and ImportModal components"
```

---

## Task 12 : GitHub Actions deploy

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1 : Créer `.github/workflows/deploy.yml`**

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

permissions:
  contents: write

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Deploy to gh-pages
        uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
```

- [ ] **Step 2 : Commit et push**

```bash
git add .github/
git commit -m "ci: GitHub Actions deploy to gh-pages"
git push origin main
```

- [ ] **Step 3 : Vérifier le workflow**

Sur GitHub → onglet Actions → vérifier que le job `deploy` passe au vert. Ensuite ouvrir `https://jeremyfoisil.github.io/mfga/` et vérifier que l'app est accessible.

---

## Task 13 : Nettoyage final

**Files:**
- Delete: `index.html.bak`
- Delete: `assets/` (les originaux, maintenant dans `public/assets/`)

- [ ] **Step 1 : Vérifier que vite build passe sans erreur TS**

```bash
npm run build
```

Expected: `dist/` généré, aucune erreur TypeScript.

- [ ] **Step 2 : Test de smoke complet dans le navigateur**

Vérifier manuellement :
1. Page de login s'affiche
2. Login avec `jeremy` / `Coco35` fonctionne
3. Les 5 tabs s'affichent et les données se chargent
4. Saisir un pronostic → sauvegarde (flash "✓ Sauvegardé")
5. Onglet Tableau affiche l'image
6. Onglet Classement affiche le podium
7. Mode Admin fonctionne (mot de passe `GOAT`)
8. Déconnexion fonctionne

- [ ] **Step 3 : Supprimer les fichiers obsolètes**

```bash
git rm index.html.bak
git rm -r assets/
```

- [ ] **Step 4 : Commit final**

```bash
git add -A
git commit -m "chore: cleanup legacy files after Vite migration"
git push origin main
```

---

## Self-Review

**Couverture spec :**
- ✅ Vite + Vue 3 + TypeScript + Pinia — Tasks 1, 6, 7
- ✅ Structure fichiers conforme au spec — Tasks 1–11
- ✅ Stores Pinia par domaine — Task 6
- ✅ GitHub Actions → gh-pages — Task 12
- ✅ `base: '/mfga/'` dans vite.config — Task 1
- ✅ Logique inchangée (calcMatchPoints, mapMatchRow, debounce, realtime) — Tasks 4, 6
- ✅ CSS global préservé — Task 7 (App.vue `<style>`)
- ✅ Assets dans `public/assets/` — Task 1

**Consistance des types :**
- `Match`, `Participant`, `Prono`, `Goal` définis en Task 2, utilisés dans Tasks 3–6 ✅
- `mapMatchRow` retourne `Match` avec les bons champs ✅
- `toggleJoker` dans `pronostics.ts` reçoit `currentProno: Prono | undefined` ✅

**Risques à surveiller lors de l'implémentation :**
- Le `profile` Supabase doit exposer un champ `username` — si ce n'est pas le cas, adapter `AppHeader` pour afficher `profile.name` ou autre champ disponible.
- La Task 10 (Steps 3, 4, 5) demande une extraction manuelle du HTML depuis `index.html.bak` — c'est intentionnel : le HTML des onglets est volumineux et copié à l'identique, seules les références aux variables changent.
