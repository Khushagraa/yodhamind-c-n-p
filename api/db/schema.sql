-- ══════════════════════════════════════════════════════════════════
--  YodhaMind — PostgreSQL Schema
--  ─────────────────────────────────────────────────────────────────
--  Run:  psql $DATABASE_URL -f api/db/schema.sql
--  Or:   npm run db:migrate
--
--  Design principles:
--    • UUID primary keys everywhere (no sequential ID leakage)
--    • All timestamps in UTC (timestamptz)
--    • Soft deletes via deleted_at (nothing is hard-deleted)
--    • JSONB for flexible metadata that doesn't need indexing
--    • Row-level check constraints enforce data integrity
--    • Indexes on every foreign key + common query patterns
-- ══════════════════════════════════════════════════════════════════

-- ── Extensions ───────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Schema version tracking ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS schema_migrations (
  version     VARCHAR(20)  NOT NULL PRIMARY KEY,
  applied_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

INSERT INTO schema_migrations (version) VALUES ('1.0.0')
  ON CONFLICT DO NOTHING;


-- ════════════════════════════════════════════════════════════════
--  USERS
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS users (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  email           VARCHAR(255)  NOT NULL UNIQUE,
  password_hash   VARCHAR(255),              -- NULL when OAuth only
  name            VARCHAR(100),
  college         VARCHAR(200),
  stream          VARCHAR(80),               -- 'JEE' | 'NEET' | 'Engineering' | 'Arts' | …
  year_of_study   SMALLINT      CHECK (year_of_study BETWEEN 1 AND 6),
  avatar_url      TEXT,
  role            VARCHAR(20)   NOT NULL DEFAULT 'student'
                                CHECK (role IN ('student','psychologist','admin')),
  is_verified     BOOLEAN       NOT NULL DEFAULT FALSE,
  verify_token    VARCHAR(128),
  reset_token     VARCHAR(128),
  reset_token_exp TIMESTAMPTZ,
  last_login_at   TIMESTAMPTZ,
  institution_code VARCHAR(40)  NOT NULL DEFAULT 'DEFAULT',
  metadata        JSONB         NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ                             -- soft delete
);

CREATE INDEX IF NOT EXISTS idx_users_email            ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_role             ON users (role);
CREATE INDEX IF NOT EXISTS idx_users_institution      ON users (institution_code);
CREATE INDEX IF NOT EXISTS idx_users_deleted          ON users (deleted_at) WHERE deleted_at IS NULL;


-- ════════════════════════════════════════════════════════════════
--  MOOD LOGS
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS mood_logs (
  id          UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mood        SMALLINT      NOT NULL CHECK (mood BETWEEN 1 AND 5),
  label       VARCHAR(20)   NOT NULL,       -- 'amazing' | 'good' | 'okay' | 'low' | 'rough'
  note        TEXT          NOT NULL DEFAULT '',
  logged_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mood_logs_user_date
  ON mood_logs (user_id, logged_at DESC);


-- ════════════════════════════════════════════════════════════════
--  ASSESSMENTS
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS assessments (
  id           UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type         VARCHAR(20)   NOT NULL CHECK (type IN ('stress','anxiety','burnout','focus')),
  raw_score    SMALLINT      NOT NULL CHECK (raw_score >= 0),
  max_score    SMALLINT      NOT NULL,
  risk         SMALLINT      NOT NULL CHECK (risk BETWEEN 0 AND 100),
  severity     VARCHAR(40)   NOT NULL,
  responses    JSONB         NOT NULL DEFAULT '[]',   -- [0,2,1,3,…] raw answer indices
  suggestions  JSONB         NOT NULL DEFAULT '[]',
  taken_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assessments_user_type
  ON assessments (user_id, type, taken_at DESC);

CREATE INDEX IF NOT EXISTS idx_assessments_user_date
  ON assessments (user_id, taken_at DESC);


-- ════════════════════════════════════════════════════════════════
--  GAME SCORES
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS game_scores (
  id           UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id      VARCHAR(40)   NOT NULL,  -- 'yodha_match' | 'lumina' | 'enchaeos' | …
  score        INTEGER       NOT NULL CHECK (score >= 0),
  level        SMALLINT      NOT NULL DEFAULT 1 CHECK (level >= 1),
  duration_ms  INTEGER       NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
  metadata     JSONB         NOT NULL DEFAULT '{}',
  played_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_scores_user_game
  ON game_scores (user_id, game_id, played_at DESC);

CREATE INDEX IF NOT EXISTS idx_game_scores_leaderboard
  ON game_scores (game_id, score DESC);


-- ════════════════════════════════════════════════════════════════
--  JOURNAL ENTRIES
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS journal_entries (
  id          UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       VARCHAR(200)  NOT NULL DEFAULT '',
  content     TEXT          NOT NULL,
  mood        SMALLINT      CHECK (mood BETWEEN 1 AND 5),
  tags        TEXT[]        NOT NULL DEFAULT '{}',
  written_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ                            -- soft delete
);

CREATE INDEX IF NOT EXISTS idx_journal_user_date
  ON journal_entries (user_id, written_at DESC)
  WHERE deleted_at IS NULL;

-- Full-text search on journal content + title
CREATE INDEX IF NOT EXISTS idx_journal_fts
  ON journal_entries
  USING GIN (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(content,'')))
  WHERE deleted_at IS NULL;


-- ════════════════════════════════════════════════════════════════
--  WELLNESS SCORES  (daily snapshot cache)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS wellness_scores (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score         SMALLINT    NOT NULL CHECK (score BETWEEN 0 AND 100),
  label         VARCHAR(30) NOT NULL,
  mood_component    SMALLINT NOT NULL DEFAULT 50,
  engage_component  SMALLINT NOT NULL DEFAULT 50,
  assess_component  SMALLINT NOT NULL DEFAULT 50,
  streak_component  SMALLINT NOT NULL DEFAULT 50,
  computed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wellness_user_date
  ON wellness_scores (user_id, computed_at DESC);

-- Only keep one snapshot per user per day (enforce via app layer, not DB)
CREATE UNIQUE INDEX IF NOT EXISTS idx_wellness_user_day
  ON wellness_scores (user_id, DATE(computed_at));


-- ════════════════════════════════════════════════════════════════
--  STREAKS
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS streaks (
  user_id         UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  current_streak  SMALLINT    NOT NULL DEFAULT 0 CHECK (current_streak >= 0),
  longest_streak  SMALLINT    NOT NULL DEFAULT 0 CHECK (longest_streak >= 0),
  last_check_in   DATE,
  total_check_ins INTEGER     NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ════════════════════════════════════════════════════════════════
--  PSYCHOLOGIST PROFILES
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS psychologist_profiles (
  id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID         NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  display_name     VARCHAR(120) NOT NULL,
  specialisation   VARCHAR(200) NOT NULL DEFAULT '',
  credentials      VARCHAR(300) NOT NULL DEFAULT '',
  bio              TEXT         NOT NULL DEFAULT '',
  fee_inr          INTEGER      NOT NULL DEFAULT 500 CHECK (fee_inr >= 0),
  rating           NUMERIC(3,2) NOT NULL DEFAULT 0.0 CHECK (rating BETWEEN 0 AND 5),
  total_sessions   INTEGER      NOT NULL DEFAULT 0,
  tags             TEXT[]       NOT NULL DEFAULT '{}',  -- ['stress','anxiety','burnout',…]
  session_types    TEXT[]       NOT NULL DEFAULT '{"chat","video","phone"}',
  is_available     BOOLEAN      NOT NULL DEFAULT TRUE,
  next_slot        VARCHAR(60)  NOT NULL DEFAULT '',
  avatar_initials  VARCHAR(4)   NOT NULL DEFAULT 'DR',
  grad_start       VARCHAR(10)  NOT NULL DEFAULT '#7C5CBF',
  grad_end         VARCHAR(10)  NOT NULL DEFAULT '#56CFB2',
  college_code     VARCHAR(40),                         -- NULL = visible to all colleges
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_psych_available
  ON psychologist_profiles (is_available, rating DESC);

CREATE INDEX IF NOT EXISTS idx_psych_tags
  ON psychologist_profiles USING GIN (tags);


-- ════════════════════════════════════════════════════════════════
--  PSYCHOLOGIST AVAILABILITY
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS availability_slots (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  psychologist_id UUID        NOT NULL REFERENCES psychologist_profiles(id) ON DELETE CASCADE,
  day_of_week     VARCHAR(10) NOT NULL CHECK (day_of_week IN
                              ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')),
  slot_time       TIME        NOT NULL,
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_avail_unique_slot
  ON availability_slots (psychologist_id, day_of_week, slot_time);


-- ════════════════════════════════════════════════════════════════
--  APPOINTMENTS
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS appointments (
  id                 UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_ref        VARCHAR(20)  NOT NULL UNIQUE,   -- 'YM-12345' human-readable ref
  student_id         UUID         NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  psychologist_id    UUID         NOT NULL REFERENCES psychologist_profiles(id) ON DELETE RESTRICT,
  session_date       DATE         NOT NULL,
  session_time       TIME         NOT NULL,
  session_type       VARCHAR(20)  NOT NULL DEFAULT 'chat'
                                  CHECK (session_type IN ('chat','video','phone')),
  concern            TEXT         NOT NULL DEFAULT '',
  stress_level       VARCHAR(20)  NOT NULL DEFAULT 'Unknown',
  status             VARCHAR(20)  NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending','confirmed','completed','cancelled')),
  fee_inr            INTEGER      NOT NULL DEFAULT 0,
  cancel_reason      TEXT,
  notes              TEXT,        -- psychologist's private session notes
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appt_student       ON appointments (student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_appt_psychologist  ON appointments (psychologist_id, session_date);
CREATE INDEX IF NOT EXISTS idx_appt_status        ON appointments (status);
CREATE INDEX IF NOT EXISTS idx_appt_date          ON appointments (session_date);


-- ════════════════════════════════════════════════════════════════
--  ANONYMOUS COMMUNITY POSTS
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS community_posts (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_hash   VARCHAR(64) NOT NULL,    -- HMAC of session id — links posts without deanonymising
  post_type      VARCHAR(10) NOT NULL DEFAULT 'share'
                             CHECK (post_type IN ('share','question')),
  category       VARCHAR(20) NOT NULL DEFAULT 'general'
                             CHECK (category IN ('academics','exams','stress','burnout','relationships','general')),
  content        TEXT        NOT NULL CHECK (char_length(content) BETWEEN 10 AND 500),
  relates_count  INTEGER     NOT NULL DEFAULT 0 CHECK (relates_count >= 0),
  is_flagged     BOOLEAN     NOT NULL DEFAULT FALSE,
  is_removed     BOOLEAN     NOT NULL DEFAULT FALSE,
  institution_code VARCHAR(40) NOT NULL DEFAULT 'DEFAULT',
  posted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_posts_cat_date
  ON community_posts (category, posted_at DESC)
  WHERE is_removed = FALSE;

CREATE INDEX IF NOT EXISTS idx_posts_relates
  ON community_posts (relates_count DESC)
  WHERE is_removed = FALSE;

CREATE INDEX IF NOT EXISTS idx_posts_type
  ON community_posts (post_type, posted_at DESC)
  WHERE is_removed = FALSE;


-- ════════════════════════════════════════════════════════════════
--  COMMUNITY COMMENTS
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS community_comments (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id       UUID        NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  session_hash  VARCHAR(64) NOT NULL,
  content       TEXT        NOT NULL CHECK (char_length(content) BETWEEN 1 AND 300),
  is_removed    BOOLEAN     NOT NULL DEFAULT FALSE,
  posted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_post
  ON community_comments (post_id, posted_at ASC)
  WHERE is_removed = FALSE;


-- ════════════════════════════════════════════════════════════════
--  COMMUNITY RELATES  (prevents double-relating)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS community_relates (
  post_id      UUID        NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  session_hash VARCHAR(64) NOT NULL,
  related_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, session_hash)
);


-- ════════════════════════════════════════════════════════════════
--  REFRESH TOKENS  (for auth token rotation)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(128) NOT NULL UNIQUE,   -- SHA-256 of the raw token
  expires_at  TIMESTAMPTZ  NOT NULL,
  revoked     BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_token_hash ON refresh_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_user       ON refresh_tokens (user_id);


-- ════════════════════════════════════════════════════════════════
--  TRIGGERS — auto-update updated_at
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to every table that has updated_at
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users', 'psychologist_profiles', 'appointments', 'journal_entries'
  ]
  LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I;
      CREATE TRIGGER trg_%I_updated_at
        BEFORE UPDATE ON %I
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    ', t, t, t, t);
  END LOOP;
END;
$$;


-- ════════════════════════════════════════════════════════════════
--  VIEWS — convenience queries used by API routes
-- ════════════════════════════════════════════════════════════════

-- Latest wellness score per user
CREATE OR REPLACE VIEW v_latest_wellness AS
SELECT DISTINCT ON (user_id)
  user_id, score, label, computed_at,
  mood_component, engage_component, assess_component, streak_component
FROM wellness_scores
ORDER BY user_id, computed_at DESC;

-- Psychologist cards (joins profile + user for name/email)
CREATE OR REPLACE VIEW v_psychologist_cards AS
SELECT
  pp.id,
  pp.user_id,
  u.email,
  pp.display_name     AS name,
  pp.specialisation,
  pp.credentials,
  pp.bio,
  pp.fee_inr          AS fee,
  pp.rating,
  pp.total_sessions   AS sessions,
  pp.tags,
  pp.session_types,
  pp.is_available     AS available,
  pp.next_slot,
  pp.avatar_initials  AS initials,
  pp.grad_start,
  pp.grad_end,
  pp.college_code
FROM psychologist_profiles pp
JOIN users u ON u.id = pp.user_id
WHERE u.deleted_at IS NULL;

-- Student appointment history with psychologist name
CREATE OR REPLACE VIEW v_student_appointments AS
SELECT
  a.id,
  a.booking_ref,
  a.student_id,
  a.psychologist_id,
  pp.display_name      AS doctor_name,
  a.session_date,
  a.session_time,
  a.session_type,
  a.concern,
  a.stress_level,
  a.status,
  a.fee_inr,
  a.created_at,
  a.updated_at
FROM appointments a
JOIN psychologist_profiles pp ON pp.id = a.psychologist_id;
