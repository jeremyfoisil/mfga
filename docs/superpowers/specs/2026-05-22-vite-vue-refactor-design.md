# Design : Refactorisation Vite/Vue/TS/Pinia

**Date :** 2026-05-22
**Scope :** Migrer `index.html` (1875 lignes, Vue 3 CDN) vers un projet Vite + Vue 3 + TypeScript + Pinia, sans changer la logique ni le rendu visuel.

---

## Contexte

L'app MFGA est actuellement un unique `index.html` contenant CSS, constantes JS, état réactif, fonctions métier et template Vue 3 (chargé via CDN). L'objectif est de découper ce fichier en une arborescence de composants et stores maintenable, avec un outillage de build moderne (HMR, tree-shaking, TypeScript).

**Contraintes :**
- Aucun changement visuel ni fonctionnel
- Déploiement GitHub Pages conservé
- Approche : migration directe (pas de refonte CSS, pas de réécriture de logique)

---

## Stack

| Outil | Rôle |
|-------|------|
| Vite | Bundler, dev server HMR |
| Vue 3 + `<script setup>` | Framework UI |
| TypeScript | Typage statique |
| Pinia | State management global |
| Supabase JS | Client BDD + Realtime (inchangé) |
| GitHub Actions | CI/CD → gh-pages |

---

## Structure des fichiers

```
mfga/
├── .github/workflows/deploy.yml
├── public/assets/
│   ├── mascot.png
│   └── tableau.png
├── src/
│   ├── main.ts
│   ├── App.vue
│   ├── supabase.ts
│   ├── constants/
│   │   ├── teams.ts        # GROUPS, ALL_TEAMS, FLAG_EMOJIS, FLAG_COLORS, TEAM_EN_FR
│   │   ├── bonus.ts        # BONUS_TYPES, BONUS_ICONS
│   │   └── ui.ts           # C, TABS, KO_STAGES, GROUP_IDS, CONFETTI_BITS, medalColors…
│   ├── utils/
│   │   ├── match.ts        # calcMatchPoints, mapMatchRow, matchStartsAtMs, formatDate
│   │   ├── goals.ts        # parseGoalLine, goalsToText
│   │   └── ui.ts           # initials, getFlag, getFlagBg
│   ├── stores/
│   │   ├── auth.ts         # session, profile, authMode, login/logout/register
│   │   ├── app.ts          # loaded, saveMsg, rtStatus, loadAll(), realtime channel
│   │   ├── matches.ts      # matches[], setMatchResult, setMatchGoalText
│   │   ├── participants.ts # participants[]
│   │   ├── pronostics.ts   # pronostics{}, jokers{}, setProno, toggleJoker
│   │   ├── bonus.ts        # bonusPronostics{}, bonusResults{}, setBonus, setBonusResult
│   │   └── admin.ts        # isAdmin, showAdminModal, submitAdminPass, exitAdmin
│   ├── components/
│   │   ├── AppHeader.vue
│   │   ├── AuthScreen.vue
│   │   ├── tabs/
│   │   │   ├── TabParticipants.vue
│   │   │   ├── TabMatchs.vue
│   │   │   ├── TabBonus.vue
│   │   │   ├── TabTableau.vue
│   │   │   └── TabClassement.vue
│   │   └── modals/
│   │       ├── AdminModal.vue
│   │       └── ImportModal.vue
│   └── types/
│       └── index.ts        # Match, Participant, Prono, BonusType, Goal…
├── index.html              # entrée Vite minimale
├── vite.config.ts          # base: '/mfga/'
├── tsconfig.json
└── package.json
```

---

## Stores Pinia

| Store | État | Actions |
|-------|------|---------|
| `auth` | `session`, `profile`, `authMode`, `authUsername`, `authPassword`, `authError`, `authLoading` | `login()`, `logout()`, `register()` |
| `app` | `loaded`, `rtStatus`, `saveMsg`, `tab` | `loadAll()`, `startRealtime()` |
| `matches` | `matches: Match[]` | `setMatchResult()`, `setMatchGoalText()` |
| `participants` | `participants: Participant[]` | — |
| `pronostics` | `pronostics: Record<id, Record<matchId, Prono>>`, `jokers: Record<id, matchId>` | `setProno()`, `toggleJoker()` |
| `bonus` | `bonusPronostics{}`, `bonusResults{}` | `setBonus()`, `setBonusResult()` |
| `admin` | `isAdmin`, `showAdminModal`, `adminPassInput`, `adminPassError`, `showImportModal` | `submitAdminPass()`, `exitAdmin()`, `importJson()` |

---

## Flux de données

1. `App.vue` observe `auth.session`
2. Session établie → `app.loadAll()` : charge participants, matches, pronostics, bonus en parallèle (Promise.all)
3. `app.startRealtime()` : ouvre channel Supabase, dispatche les événements vers chaque store
4. Composants tabs lisent les stores via `storeToRefs()`, appellent les actions directement

Les fonctions pures (calculs de score, formatage) vivent dans `utils/` et n'ont aucune dépendance de store.

---

## GitHub Actions

Fichier `.github/workflows/deploy.yml` :
- Déclenché sur `push` vers `main`
- Steps : `npm ci` → `vite build` → `peaceiris/actions-gh-pages` vers branche `gh-pages`
- `vite.config.ts` : `base: '/mfga/'` pour résolution correcte des assets
- Pas de secrets nécessaires (clé Supabase anon publique inlinée dans `supabase.ts`)

---

## Ce qui ne change pas

- Logique métier (calcul de points, time-lock, jokers, bonus)
- Styles (tous les styles inline restent tels quels dans les composants)
- Schéma Supabase
- Rendu visuel final
