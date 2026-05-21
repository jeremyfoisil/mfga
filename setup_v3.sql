-- =============================================================================
-- MFGA v3 — Migration : table `matches` comme source unique de vérité
-- Lancer dans Supabase SQL Editor (idempotent, peut être relancé sans risque)
-- =============================================================================

-- ── 1. Nouvelles colonnes sur matches ────────────────────────────────────────

ALTER TABLE matches ADD COLUMN IF NOT EXISTS home_team   TEXT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS away_team   TEXT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS group_id    TEXT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS stage       TEXT DEFAULT 'group';
ALTER TABLE matches ADD COLUMN IF NOT EXISTS home_label  TEXT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS away_label  TEXT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS result_home INTEGER;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS result_away INTEGER;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS goals_home  JSONB DEFAULT '[]';
ALTER TABLE matches ADD COLUMN IF NOT EXISTS goals_away  JSONB DEFAULT '[]';

-- ── 2. Noms d'équipes (FR) + group_id pour les 72 matchs de groupe ───────────

UPDATE matches AS m
SET home_team = v.home, away_team = v.away, group_id = v.grp, stage = 'group'
FROM (VALUES
  -- Groupe A
  (1,  'Mexique',           'Afrique du Sud',   'A'),
  (2,  'Mexique',           'Corée du Sud',      'A'),
  (3,  'Mexique',           'Rép. tchèque',      'A'),
  (4,  'Afrique du Sud',    'Corée du Sud',      'A'),
  (5,  'Afrique du Sud',    'Rép. tchèque',      'A'),
  (6,  'Corée du Sud',      'Rép. tchèque',      'A'),
  -- Groupe B
  (7,  'Canada',            'Bosnie-Herzégovine','B'),
  (8,  'Canada',            'Qatar',             'B'),
  (9,  'Canada',            'Suisse',            'B'),
  (10, 'Bosnie-Herzégovine','Qatar',             'B'),
  (11, 'Bosnie-Herzégovine','Suisse',            'B'),
  (12, 'Qatar',             'Suisse',            'B'),
  -- Groupe C
  (13, 'Brésil',            'Maroc',             'C'),
  (14, 'Brésil',            'Haïti',             'C'),
  (15, 'Brésil',            'Écosse',            'C'),
  (16, 'Maroc',             'Haïti',             'C'),
  (17, 'Maroc',             'Écosse',            'C'),
  (18, 'Haïti',             'Écosse',            'C'),
  -- Groupe D
  (19, 'États-Unis',        'Paraguay',          'D'),
  (20, 'États-Unis',        'Australie',         'D'),
  (21, 'États-Unis',        'Turquie',           'D'),
  (22, 'Paraguay',          'Australie',         'D'),
  (23, 'Paraguay',          'Turquie',           'D'),
  (24, 'Australie',         'Turquie',           'D'),
  -- Groupe E
  (25, 'Allemagne',         'Curaçao',           'E'),
  (26, 'Allemagne',         'Côte d''Ivoire',    'E'),
  (27, 'Allemagne',         'Équateur',          'E'),
  (28, 'Curaçao',           'Côte d''Ivoire',    'E'),
  (29, 'Curaçao',           'Équateur',          'E'),
  (30, 'Côte d''Ivoire',    'Équateur',          'E'),
  -- Groupe F
  (31, 'Pays-Bas',          'Japon',             'F'),
  (32, 'Pays-Bas',          'Suède',             'F'),
  (33, 'Pays-Bas',          'Tunisie',           'F'),
  (34, 'Japon',             'Suède',             'F'),
  (35, 'Japon',             'Tunisie',           'F'),
  (36, 'Suède',             'Tunisie',           'F'),
  -- Groupe G
  (37, 'Belgique',          'Égypte',            'G'),
  (38, 'Belgique',          'Iran',              'G'),
  (39, 'Belgique',          'Nouvelle-Zélande',  'G'),
  (40, 'Égypte',            'Iran',              'G'),
  (41, 'Égypte',            'Nouvelle-Zélande',  'G'),
  (42, 'Iran',              'Nouvelle-Zélande',  'G'),
  -- Groupe H
  (43, 'Espagne',           'Cap-Vert',          'H'),
  (44, 'Espagne',           'Arabie Saoudite',   'H'),
  (45, 'Espagne',           'Uruguay',           'H'),
  (46, 'Cap-Vert',          'Arabie Saoudite',   'H'),
  (47, 'Cap-Vert',          'Uruguay',           'H'),
  (48, 'Arabie Saoudite',   'Uruguay',           'H'),
  -- Groupe I
  (49, 'France',            'Sénégal',           'I'),
  (50, 'France',            'Irak',              'I'),
  (51, 'France',            'Norvège',           'I'),
  (52, 'Sénégal',           'Irak',              'I'),
  (53, 'Sénégal',           'Norvège',           'I'),
  (54, 'Irak',              'Norvège',           'I'),
  -- Groupe J
  (55, 'Argentine',         'Algérie',           'J'),
  (56, 'Argentine',         'Autriche',          'J'),
  (57, 'Argentine',         'Jordanie',          'J'),
  (58, 'Algérie',           'Autriche',          'J'),
  (59, 'Algérie',           'Jordanie',          'J'),
  (60, 'Autriche',          'Jordanie',          'J'),
  -- Groupe K
  (61, 'Portugal',          'RD Congo',          'K'),
  (62, 'Portugal',          'Ouzbékistan',       'K'),
  (63, 'Portugal',          'Colombie',          'K'),
  (64, 'RD Congo',          'Ouzbékistan',       'K'),
  (65, 'RD Congo',          'Colombie',          'K'),
  (66, 'Ouzbékistan',       'Colombie',          'K'),
  -- Groupe L
  (67, 'Angleterre',        'Croatie',           'L'),
  (68, 'Angleterre',        'Ghana',             'L'),
  (69, 'Angleterre',        'Panama',            'L'),
  (70, 'Croatie',           'Ghana',             'L'),
  (71, 'Croatie',           'Panama',            'L'),
  (72, 'Ghana',             'Panama',            'L')
) AS v(id, home, away, grp)
WHERE m.id = v.id;

-- ── 3. Migrer résultats & buteurs depuis match_results vers matches ───────────

UPDATE matches m
SET result_home = mr.result_home,
    result_away = mr.result_away,
    goals_home  = COALESCE(mr.goals_home, '[]'::jsonb),
    goals_away  = COALESCE(mr.goals_away, '[]'::jsonb),
    match_date  = COALESCE(mr.match_date::date, m.match_date),
    match_time  = COALESCE(mr.match_time, m.match_time),
    venue       = COALESCE(mr.venue, m.venue),
    round       = COALESCE(mr.round, m.round)
FROM match_results mr
WHERE m.id = mr.match_id
  AND mr.result_home IS NOT NULL;

-- ── 4. Insérer les 32 matchs KO (idempotent via ON CONFLICT) ─────────────────

INSERT INTO matches (id, stage, home_label, away_label, round, match_date, match_time, venue)
VALUES
  -- Round of 32
  (73,  'r32',   '2A',        '2B',           'Round of 32',          '2026-06-28', '12:00 UTC-7', 'Los Angeles (Inglewood)'),
  (74,  'r32',   '1E',        '3A/B/C/D/F',   'Round of 32',          '2026-06-29', '16:30 UTC-4', 'Boston (Foxborough)'),
  (75,  'r32',   '1F',        '2C',           'Round of 32',          '2026-06-29', '19:00 UTC-6', 'Monterrey (Guadalupe)'),
  (76,  'r32',   '1C',        '2F',           'Round of 32',          '2026-06-29', '12:00 UTC-5', 'Houston'),
  (77,  'r32',   '1I',        '3C/D/F/G/H',   'Round of 32',          '2026-06-30', '17:00 UTC-4', 'New York/New Jersey (East Rutherford)'),
  (78,  'r32',   '2E',        '2I',           'Round of 32',          '2026-06-30', '12:00 UTC-5', 'Dallas (Arlington)'),
  (79,  'r32',   '1A',        '3C/E/F/H/I',   'Round of 32',          '2026-06-30', '19:00 UTC-6', 'Mexico City'),
  (80,  'r32',   '1L',        '3E/H/I/J/K',   'Round of 32',          '2026-07-01', '12:00 UTC-4', 'Atlanta'),
  (81,  'r32',   '1D',        '3B/E/F/I/J',   'Round of 32',          '2026-07-01', '17:00 UTC-7', 'San Francisco Bay Area (Santa Clara)'),
  (82,  'r32',   '1G',        '3A/E/H/I/J',   'Round of 32',          '2026-07-01', '13:00 UTC-7', 'Seattle'),
  (83,  'r32',   '2K',        '2L',           'Round of 32',          '2026-07-02', '19:00 UTC-4', 'Toronto'),
  (84,  'r32',   '1H',        '2J',           'Round of 32',          '2026-07-02', '12:00 UTC-7', 'Los Angeles (Inglewood)'),
  (85,  'r32',   '1B',        '3E/F/G/I/J',   'Round of 32',          '2026-07-02', '20:00 UTC-7', 'Vancouver'),
  (86,  'r32',   '1J',        '2H',           'Round of 32',          '2026-07-03', '18:00 UTC-4', 'Miami (Miami Gardens)'),
  (87,  'r32',   '1K',        '3D/E/I/J/L',   'Round of 32',          '2026-07-03', '20:30 UTC-5', 'Kansas City'),
  (88,  'r32',   '2D',        '2G',           'Round of 32',          '2026-07-03', '13:00 UTC-5', 'Dallas (Arlington)'),
  -- Round of 16
  (89,  'r16',   'W74',       'W77',          'Round of 16',           '2026-07-04', '17:00 UTC-4', 'Philadelphia'),
  (90,  'r16',   'W73',       'W75',          'Round of 16',           '2026-07-04', '12:00 UTC-5', 'Houston'),
  (91,  'r16',   'W76',       'W78',          'Round of 16',           '2026-07-05', '16:00 UTC-4', 'New York/New Jersey (East Rutherford)'),
  (92,  'r16',   'W79',       'W80',          'Round of 16',           '2026-07-05', '18:00 UTC-6', 'Mexico City'),
  (93,  'r16',   'W83',       'W84',          'Round of 16',           '2026-07-06', '14:00 UTC-5', 'Dallas (Arlington)'),
  (94,  'r16',   'W81',       'W82',          'Round of 16',           '2026-07-06', '17:00 UTC-7', 'Seattle'),
  (95,  'r16',   'W86',       'W88',          'Round of 16',           '2026-07-07', '12:00 UTC-4', 'Atlanta'),
  (96,  'r16',   'W85',       'W87',          'Round of 16',           '2026-07-07', '13:00 UTC-7', 'Vancouver'),
  -- Quarts de finale
  (97,  'qf',    'W89',       'W90',          'Quarter-final',         '2026-07-09', '16:00 UTC-4', 'Boston (Foxborough)'),
  (98,  'qf',    'W93',       'W94',          'Quarter-final',         '2026-07-10', '12:00 UTC-7', 'Los Angeles (Inglewood)'),
  (99,  'qf',    'W91',       'W92',          'Quarter-final',         '2026-07-11', '17:00 UTC-4', 'Miami (Miami Gardens)'),
  (100, 'qf',    'W95',       'W96',          'Quarter-final',         '2026-07-11', '20:00 UTC-5', 'Kansas City'),
  -- Demi-finales
  (101, 'sf',    'W97',       'W98',          'Semi-final',            '2026-07-14', '14:00 UTC-5', 'Dallas (Arlington)'),
  (102, 'sf',    'W99',       'W100',         'Semi-final',            '2026-07-15', '15:00 UTC-4', 'Atlanta'),
  -- Petite finale
  (103, '3rd',   'L101',      'L102',         'Match for third place', '2026-07-18', '17:00 UTC-4', 'Miami (Miami Gardens)'),
  -- Finale
  (104, 'final', 'W101',      'W102',         'Final',                 '2026-07-19', '15:00 UTC-4', 'New York/New Jersey (East Rutherford)')
ON CONFLICT (id) DO UPDATE SET
  stage       = EXCLUDED.stage,
  home_label  = EXCLUDED.home_label,
  away_label  = EXCLUDED.away_label,
  round       = EXCLUDED.round,
  match_date  = COALESCE(matches.match_date, EXCLUDED.match_date),
  match_time  = COALESCE(matches.match_time, EXCLUDED.match_time),
  venue       = COALESCE(matches.venue, EXCLUDED.venue);

-- ── 5. Trigger : calcul automatique des scores dans pronostics ───────────────

CREATE OR REPLACE FUNCTION compute_prono_scores()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.result_home IS NOT NULL AND NEW.result_away IS NOT NULL THEN
    UPDATE pronostics p
    SET score = CASE
      WHEN p.prono_home = NEW.result_home AND p.prono_away = NEW.result_away
           THEN CASE WHEN p.is_joker THEN 6 ELSE 3 END
      WHEN SIGN(p.prono_home::int - p.prono_away::int) = SIGN(NEW.result_home - NEW.result_away)
           THEN CASE WHEN p.is_joker THEN 2 ELSE 1 END
      ELSE 0
    END
    WHERE p.match_id = NEW.id
      AND p.prono_home IS NOT NULL
      AND p.prono_away IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_compute_scores ON matches;
CREATE TRIGGER trg_compute_scores
AFTER INSERT OR UPDATE OF result_home, result_away ON matches
FOR EACH ROW EXECUTE FUNCTION compute_prono_scores();

-- ── 6. RLS policies sur matches ──────────────────────────────────────────────

ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='matches' AND policyname='matches_select') THEN
    CREATE POLICY "matches_select" ON matches FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='matches' AND policyname='matches_write') THEN
    CREATE POLICY "matches_write" ON matches FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── 7. Vérification ──────────────────────────────────────────────────────────

-- Doit retourner 104 lignes (72 groupes + 32 KO)
SELECT stage, COUNT(*) FROM matches GROUP BY stage ORDER BY MIN(id);
