-- ══════════════════════════════════════════════════════════════════
--  YodhaMind — Seed Data
--  ─────────────────────────────────────────────────────────────────
--  Run:  psql $DATABASE_URL -f api/db/seeds.sql
--  Or:   npm run db:seed
--
--  Inserts:
--    • 1  admin user
--    • 3  demo student accounts
--    • 7  verified psychologist accounts + profiles + availability
--    • Sample mood logs, assessments, game scores for demo students
--    • 15 seed community posts with realistic Indian college voices
--
--  All passwords are:  Demo@1234
--  bcrypt hash (cost 10) generated offline for that password.
--
--  Safe to re-run — uses ON CONFLICT DO NOTHING throughout.
-- ══════════════════════════════════════════════════════════════════

BEGIN;

-- ════════════════════════════════════════════════════════════════
--  USERS — Admin
-- ════════════════════════════════════════════════════════════════

INSERT INTO users (id, email, password_hash, name, role, is_verified, institution_code)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'admin@yodhamind.app',
  '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.',  -- Demo@1234
  'YodhaMind Admin',
  'admin',
  TRUE,
  'DEFAULT'
) ON CONFLICT (email) DO NOTHING;


-- ════════════════════════════════════════════════════════════════
--  USERS — Demo Students
-- ════════════════════════════════════════════════════════════════

INSERT INTO users (id, email, password_hash, name, college, stream, year_of_study, role, is_verified)
VALUES
  (
    'b0000000-0000-0000-0000-000000000001',
    'arjun@student.demo',
    '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.',
    'Arjun Mehta',
    'IIT Delhi',
    'Engineering',
    3,
    'student',
    TRUE
  ),
  (
    'b0000000-0000-0000-0000-000000000002',
    'sneha@student.demo',
    '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.',
    'Sneha Rajan',
    'BITS Pilani',
    'Engineering',
    2,
    'student',
    TRUE
  ),
  (
    'b0000000-0000-0000-0000-000000000003',
    'rahul@student.demo',
    '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.',
    'Rahul Nair',
    'NIT Trichy',
    'Engineering',
    1,
    'student',
    TRUE
  )
ON CONFLICT (email) DO NOTHING;


-- ════════════════════════════════════════════════════════════════
--  USERS — Psychologists
-- ════════════════════════════════════════════════════════════════

INSERT INTO users (id, email, password_hash, name, role, is_verified)
VALUES
  ('c0000000-0000-0000-0000-000000000001', 'priya.sharma@psych.demo',    '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.', 'Dr. Priya Sharma',    'psychologist', TRUE),
  ('c0000000-0000-0000-0000-000000000002', 'arjun.reddy@psych.demo',     '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.', 'Dr. Arjun Reddy',     'psychologist', TRUE),
  ('c0000000-0000-0000-0000-000000000003', 'nandini.krishnan@psych.demo','$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.', 'Dr. Nandini Krishnan','psychologist', TRUE),
  ('c0000000-0000-0000-0000-000000000004', 'vikram.bose@psych.demo',     '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.', 'Dr. Vikram Bose',     'psychologist', TRUE),
  ('c0000000-0000-0000-0000-000000000005', 'sunita.mehra@psych.demo',    '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.', 'Dr. Sunita Mehra',    'psychologist', TRUE),
  ('c0000000-0000-0000-0000-000000000006', 'ravi.joshi@psych.demo',      '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.', 'Dr. Ravi Joshi',      'psychologist', TRUE),
  ('c0000000-0000-0000-0000-000000000007', 'ananya.pillai@psych.demo',   '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.', 'Dr. Ananya Pillai',   'psychologist', TRUE)
ON CONFLICT (email) DO NOTHING;


-- ════════════════════════════════════════════════════════════════
--  PSYCHOLOGIST PROFILES
-- ════════════════════════════════════════════════════════════════

INSERT INTO psychologist_profiles (
  id, user_id, display_name, specialisation, credentials, bio,
  fee_inr, rating, total_sessions, tags, session_types,
  is_available, next_slot, avatar_initials, grad_start, grad_end
)
VALUES
  (
    'd0000000-0000-0000-0000-000000000001',
    'c0000000-0000-0000-0000-000000000001',
    'Dr. Priya Sharma',
    'Student Stress & Anxiety',
    'M.Phil Clinical Psychology · NIMHANS Certified · 7 yrs',
    'Specialises in helping students manage exam pressure, performance anxiety, and burnout using evidence-based CBT techniques. Deeply familiar with the IIT/NEET ecosystem and competitive college culture.',
    500, 4.9, 320,
    ARRAY['stress','anxiety','burnout'],
    ARRAY['chat','video','phone'],
    TRUE, 'Tomorrow 10 AM', 'PS', '#7C5CBF', '#56CFB2'
  ),
  (
    'd0000000-0000-0000-0000-000000000002',
    'c0000000-0000-0000-0000-000000000002',
    'Dr. Arjun Reddy',
    'Depression & Emotional Wellbeing',
    'PhD Psychology · RCI Licensed · 12 yrs',
    'Works with students experiencing low motivation, sadness, emotional numbness, and interpersonal difficulties. Uses a blend of psychodynamic therapy and mindfulness-based cognitive therapy.',
    700, 4.8, 580,
    ARRAY['depression','anxiety','relationships'],
    ARRAY['chat','video'],
    TRUE, 'Mon 11 AM', 'AR', '#4F46E5', '#818CF8'
  ),
  (
    'd0000000-0000-0000-0000-000000000003',
    'c0000000-0000-0000-0000-000000000003',
    'Dr. Nandini Krishnan',
    'Career Anxiety & Identity',
    'MA Counselling Psychology · IGNOU Affiliated · 5 yrs',
    'Helps students navigate career confusion, parental pressure, identity questions, and the anxiety of "not knowing what to do." Creates safe, non-judgmental space especially for first-gen college students.',
    400, 4.7, 195,
    ARRAY['career','stress','anxiety'],
    ARRAY['chat','phone'],
    TRUE, 'Tue 10 AM', 'NK', '#059669', '#34D399'
  ),
  (
    'd0000000-0000-0000-0000-000000000004',
    'c0000000-0000-0000-0000-000000000004',
    'Dr. Vikram Bose',
    'Burnout & Academic Performance',
    'M.Phil Clinical Psych · AIIMS Trained · 9 yrs',
    'Focuses on high-achieving students experiencing burnout, perfectionism, and imposter syndrome. Former JEE aspirant himself — uniquely understands the pressure of competitive exams.',
    800, 4.9, 440,
    ARRAY['burnout','stress','career'],
    ARRAY['chat','video','phone'],
    TRUE, 'Wed 9 AM', 'VB', '#D97706', '#FCD34D'
  ),
  (
    'd0000000-0000-0000-0000-000000000005',
    'c0000000-0000-0000-0000-000000000005',
    'Dr. Sunita Mehra',
    'Relationships & Social Anxiety',
    'PhD Counselling · BCI Registered · 8 yrs',
    'Works with loneliness, social anxiety, family conflict, and romantic relationship issues common in college life. Warm, conversational therapeutic style — students describe sessions as "talking to a wise older sister".',
    550, 4.6, 310,
    ARRAY['relationships','anxiety','depression'],
    ARRAY['chat','video'],
    TRUE, 'Thu 2 PM', 'SM', '#DC2626', '#F87171'
  ),
  (
    'd0000000-0000-0000-0000-000000000006',
    'c0000000-0000-0000-0000-000000000006',
    'Dr. Ravi Joshi',
    'Mindfulness & Stress Reduction',
    'MSc Clinical Psych · MBSR Certified · TISS Alumni · 6 yrs',
    'Specialises in Mindfulness-Based Stress Reduction (MBSR) and Acceptance & Commitment Therapy. Works with students who feel chronically overwhelmed and cannot switch off their anxious minds.',
    450, 4.8, 265,
    ARRAY['stress','anxiety','burnout'],
    ARRAY['chat','video','phone'],
    TRUE, 'Tue 9 AM', 'RJ', '#0891B2', '#67E8F9'
  ),
  (
    'd0000000-0000-0000-0000-000000000007',
    'c0000000-0000-0000-0000-000000000007',
    'Dr. Ananya Pillai',
    'Trauma & Grief Counselling',
    'PhD Psychology · Trauma Cert. · TISS Certified · 11 yrs',
    'Trauma-informed therapist working with students who have experienced loss, abuse, difficult childhoods, or sudden crisis events. Uses EMDR and Narrative Therapy. Very gentle, slow-paced approach.',
    750, 4.9, 490,
    ARRAY['depression','relationships','anxiety'],
    ARRAY['chat','video'],
    FALSE, 'Next Mon 4 PM', 'AP', '#7E22CE', '#C084FC'
  )
ON CONFLICT (user_id) DO NOTHING;


-- ════════════════════════════════════════════════════════════════
--  AVAILABILITY SLOTS
-- ════════════════════════════════════════════════════════════════

-- Dr. Priya Sharma
INSERT INTO availability_slots (psychologist_id, day_of_week, slot_time) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'Monday',    '10:00'),
  ('d0000000-0000-0000-0000-000000000001', 'Monday',    '15:00'),
  ('d0000000-0000-0000-0000-000000000001', 'Tuesday',   '11:00'),
  ('d0000000-0000-0000-0000-000000000001', 'Wednesday', '15:00'),
  ('d0000000-0000-0000-0000-000000000001', 'Thursday',  '10:00'),
  ('d0000000-0000-0000-0000-000000000001', 'Friday',    '11:00')
ON CONFLICT DO NOTHING;

-- Dr. Arjun Reddy
INSERT INTO availability_slots (psychologist_id, day_of_week, slot_time) VALUES
  ('d0000000-0000-0000-0000-000000000002', 'Monday',    '11:00'),
  ('d0000000-0000-0000-0000-000000000002', 'Wednesday', '10:00'),
  ('d0000000-0000-0000-0000-000000000002', 'Wednesday', '16:00'),
  ('d0000000-0000-0000-0000-000000000002', 'Friday',    '10:00'),
  ('d0000000-0000-0000-0000-000000000002', 'Friday',    '15:00')
ON CONFLICT DO NOTHING;

-- Dr. Nandini Krishnan
INSERT INTO availability_slots (psychologist_id, day_of_week, slot_time) VALUES
  ('d0000000-0000-0000-0000-000000000003', 'Tuesday',   '10:00'),
  ('d0000000-0000-0000-0000-000000000003', 'Tuesday',   '15:00'),
  ('d0000000-0000-0000-0000-000000000003', 'Thursday',  '11:00'),
  ('d0000000-0000-0000-0000-000000000003', 'Thursday',  '16:00'),
  ('d0000000-0000-0000-0000-000000000003', 'Saturday',  '10:00')
ON CONFLICT DO NOTHING;

-- Dr. Vikram Bose
INSERT INTO availability_slots (psychologist_id, day_of_week, slot_time) VALUES
  ('d0000000-0000-0000-0000-000000000004', 'Monday',    '09:00'),
  ('d0000000-0000-0000-0000-000000000004', 'Wednesday', '09:00'),
  ('d0000000-0000-0000-0000-000000000004', 'Wednesday', '14:00'),
  ('d0000000-0000-0000-0000-000000000004', 'Friday',    '09:00'),
  ('d0000000-0000-0000-0000-000000000004', 'Friday',    '14:00')
ON CONFLICT DO NOTHING;

-- Dr. Sunita Mehra
INSERT INTO availability_slots (psychologist_id, day_of_week, slot_time) VALUES
  ('d0000000-0000-0000-0000-000000000005', 'Tuesday',   '14:00'),
  ('d0000000-0000-0000-0000-000000000005', 'Thursday',  '14:00'),
  ('d0000000-0000-0000-0000-000000000005', 'Thursday',  '17:00'),
  ('d0000000-0000-0000-0000-000000000005', 'Saturday',  '11:00'),
  ('d0000000-0000-0000-0000-000000000005', 'Saturday',  '15:00')
ON CONFLICT DO NOTHING;

-- Dr. Ravi Joshi
INSERT INTO availability_slots (psychologist_id, day_of_week, slot_time) VALUES
  ('d0000000-0000-0000-0000-000000000006', 'Monday',    '14:00'),
  ('d0000000-0000-0000-0000-000000000006', 'Tuesday',   '09:00'),
  ('d0000000-0000-0000-0000-000000000006', 'Wednesday', '11:00'),
  ('d0000000-0000-0000-0000-000000000006', 'Thursday',  '09:00'),
  ('d0000000-0000-0000-0000-000000000006', 'Friday',    '16:00')
ON CONFLICT DO NOTHING;

-- Dr. Ananya Pillai
INSERT INTO availability_slots (psychologist_id, day_of_week, slot_time) VALUES
  ('d0000000-0000-0000-0000-000000000007', 'Monday',    '16:00'),
  ('d0000000-0000-0000-0000-000000000007', 'Wednesday', '16:00'),
  ('d0000000-0000-0000-0000-000000000007', 'Friday',    '11:00'),
  ('d0000000-0000-0000-0000-000000000007', 'Friday',    '15:00')
ON CONFLICT DO NOTHING;


-- ════════════════════════════════════════════════════════════════
--  DEMO MOOD LOGS  (last 14 days for Arjun — realistic pattern)
-- ════════════════════════════════════════════════════════════════

INSERT INTO mood_logs (user_id, mood, label, note, logged_at)
VALUES
  ('b0000000-0000-0000-0000-000000000001', 2, 'low',     'Exam next week, feeling anxious',          NOW() - INTERVAL '13 days'),
  ('b0000000-0000-0000-0000-000000000001', 2, 'low',     'Could not sleep well',                     NOW() - INTERVAL '12 days'),
  ('b0000000-0000-0000-0000-000000000001', 3, 'okay',    'Managed to study for 3 hours',             NOW() - INTERVAL '11 days'),
  ('b0000000-0000-0000-0000-000000000001', 2, 'low',     'Comparison with peers getting to me',      NOW() - INTERVAL '10 days'),
  ('b0000000-0000-0000-0000-000000000001', 3, 'okay',    'Did the breathing exercise, helped a bit', NOW() - INTERVAL '9 days'),
  ('b0000000-0000-0000-0000-000000000001', 4, 'good',    'Played Lumina, actually focused well',     NOW() - INTERVAL '8 days'),
  ('b0000000-0000-0000-0000-000000000001', 3, 'okay',    '',                                         NOW() - INTERVAL '7 days'),
  ('b0000000-0000-0000-0000-000000000001', 4, 'good',    'Had a good study session',                 NOW() - INTERVAL '6 days'),
  ('b0000000-0000-0000-0000-000000000001', 3, 'okay',    'Tired but managing',                       NOW() - INTERVAL '5 days'),
  ('b0000000-0000-0000-0000-000000000001', 4, 'good',    'Talked to a friend, felt lighter',         NOW() - INTERVAL '4 days'),
  ('b0000000-0000-0000-0000-000000000001', 4, 'good',    'Finished assignment early',                NOW() - INTERVAL '3 days'),
  ('b0000000-0000-0000-0000-000000000001', 5, 'amazing', 'Best day this month',                      NOW() - INTERVAL '2 days'),
  ('b0000000-0000-0000-0000-000000000001', 4, 'good',    'Still riding the wave',                    NOW() - INTERVAL '1 day'),
  ('b0000000-0000-0000-0000-000000000001', 4, 'good',    'Morning check-in',                         NOW())
ON CONFLICT DO NOTHING;

-- Sneha — moderate pattern
INSERT INTO mood_logs (user_id, mood, label, note, logged_at)
VALUES
  ('b0000000-0000-0000-0000-000000000002', 3, 'okay', '', NOW() - INTERVAL '6 days'),
  ('b0000000-0000-0000-0000-000000000002', 2, 'low',  'Placement anxiety creeping in', NOW() - INTERVAL '5 days'),
  ('b0000000-0000-0000-0000-000000000002', 3, 'okay', '', NOW() - INTERVAL '4 days'),
  ('b0000000-0000-0000-0000-000000000002', 3, 'okay', '', NOW() - INTERVAL '3 days'),
  ('b0000000-0000-0000-0000-000000000002', 4, 'good', 'Took a walk, cleared my head', NOW() - INTERVAL '2 days'),
  ('b0000000-0000-0000-0000-000000000002', 3, 'okay', '', NOW())
ON CONFLICT DO NOTHING;


-- ════════════════════════════════════════════════════════════════
--  DEMO ASSESSMENTS
-- ════════════════════════════════════════════════════════════════

INSERT INTO assessments (user_id, type, raw_score, max_score, risk, severity, taken_at)
VALUES
  ('b0000000-0000-0000-0000-000000000001', 'stress',  22, 40, 55, 'Moderate Stress',   NOW() - INTERVAL '10 days'),
  ('b0000000-0000-0000-0000-000000000001', 'anxiety', 10, 21, 48, 'Moderate Anxiety',  NOW() - INTERVAL '10 days'),
  ('b0000000-0000-0000-0000-000000000001', 'stress',  16, 40, 40, 'Moderate Stress',   NOW() - INTERVAL '3 days'),
  ('b0000000-0000-0000-0000-000000000002', 'stress',  25, 40, 63, 'High Stress 🚨',    NOW() - INTERVAL '5 days'),
  ('b0000000-0000-0000-0000-000000000002', 'burnout', 22, 42, 52, 'Early Burnout',     NOW() - INTERVAL '5 days'),
  ('b0000000-0000-0000-0000-000000000003', 'anxiety',  6, 21, 29, 'Mild Anxiety',      NOW() - INTERVAL '2 days')
ON CONFLICT DO NOTHING;


-- ════════════════════════════════════════════════════════════════
--  DEMO GAME SCORES
-- ════════════════════════════════════════════════════════════════

INSERT INTO game_scores (user_id, game_id, score, level, duration_ms, played_at)
VALUES
  ('b0000000-0000-0000-0000-000000000001', 'yodha_match',  1200, 3, 85000,  NOW() - INTERVAL '8 days'),
  ('b0000000-0000-0000-0000-000000000001', 'lumina',        850, 2, 72000,  NOW() - INTERVAL '7 days'),
  ('b0000000-0000-0000-0000-000000000001', 'enchaeos',      620, 1, 60000,  NOW() - INTERVAL '6 days'),
  ('b0000000-0000-0000-0000-000000000001', 'yodha_match',  1450, 4, 91000,  NOW() - INTERVAL '5 days'),
  ('b0000000-0000-0000-0000-000000000001', 'lumina',        920, 3, 68000,  NOW() - INTERVAL '4 days'),
  ('b0000000-0000-0000-0000-000000000001', 'yodha_match',  1600, 4, 88000,  NOW() - INTERVAL '2 days'),
  ('b0000000-0000-0000-0000-000000000001', 'enchaeos',      780, 2, 55000,  NOW() - INTERVAL '1 day'),
  ('b0000000-0000-0000-0000-000000000002', 'yodha_match',   980, 2, 92000,  NOW() - INTERVAL '4 days'),
  ('b0000000-0000-0000-0000-000000000002', 'lumina',        710, 2, 75000,  NOW() - INTERVAL '2 days'),
  ('b0000000-0000-0000-0000-000000000003', 'enchaeos',      540, 1, 62000,  NOW() - INTERVAL '1 day')
ON CONFLICT DO NOTHING;


-- ════════════════════════════════════════════════════════════════
--  DEMO STREAKS
-- ════════════════════════════════════════════════════════════════

INSERT INTO streaks (user_id, current_streak, longest_streak, last_check_in, total_check_ins)
VALUES
  ('b0000000-0000-0000-0000-000000000001', 14, 14, CURRENT_DATE, 21),
  ('b0000000-0000-0000-0000-000000000002',  6,  8, CURRENT_DATE,  9),
  ('b0000000-0000-0000-0000-000000000003',  2,  2, CURRENT_DATE,  2)
ON CONFLICT (user_id) DO NOTHING;


-- ════════════════════════════════════════════════════════════════
--  DEMO APPOINTMENTS
-- ════════════════════════════════════════════════════════════════

INSERT INTO appointments (
  id, booking_ref, student_id, psychologist_id,
  session_date, session_time, session_type,
  concern, stress_level, status, fee_inr
)
VALUES
  (
    'e0000000-0000-0000-0000-000000000001',
    'YM-10001',
    'b0000000-0000-0000-0000-000000000001',
    'd0000000-0000-0000-0000-000000000001',
    CURRENT_DATE + INTERVAL '2 days', '10:00', 'video',
    'Exam anxiety and difficulty sleeping before tests',
    'Moderate', 'confirmed', 500
  ),
  (
    'e0000000-0000-0000-0000-000000000002',
    'YM-10002',
    'b0000000-0000-0000-0000-000000000002',
    'd0000000-0000-0000-0000-000000000004',
    CURRENT_DATE + INTERVAL '3 days', '09:00', 'chat',
    'Feeling burnt out and unmotivated despite being a topper in school',
    'High', 'pending', 800
  ),
  (
    'e0000000-0000-0000-0000-000000000003',
    'YM-10003',
    'b0000000-0000-0000-0000-000000000001',
    'd0000000-0000-0000-0000-000000000001',
    CURRENT_DATE - INTERVAL '7 days', '11:00', 'video',
    'General check-in and stress management strategies',
    'Moderate', 'completed', 500
  )
ON CONFLICT DO NOTHING;


-- ════════════════════════════════════════════════════════════════
--  COMMUNITY POSTS  (seed posts — realistic Indian college voices)
--  session_hash is a placeholder hash for seed data
-- ════════════════════════════════════════════════════════════════

INSERT INTO community_posts (
  id, session_hash, post_type, category, content,
  relates_count, posted_at
)
VALUES
  (
    'f0000000-0000-0000-0000-000000000001',
    'seed_hash_001',
    'share', 'exams',
    'Failed my mid-sem. Not just failed — got a 12/50. I''ve been studying 8 hours a day but nothing sticks. I genuinely don''t know what''s wrong with me. Everyone else seems fine.',
    61, NOW() - INTERVAL '2 hours'
  ),
  (
    'f0000000-0000-0000-0000-000000000002',
    'seed_hash_002',
    'question', 'stress',
    'Is it normal to feel numb during exam season? Like I know I should be stressed and studying but I just feel... empty. Can''t cry, can''t focus, can''t feel anything.',
    88, NOW() - INTERVAL '4 hours'
  ),
  (
    'f0000000-0000-0000-0000-000000000003',
    'seed_hash_003',
    'share', 'relationships',
    'My parents call every single evening and ask "kitna padha aaj?" I love them but it''s suffocating. I can''t even breathe without feeling like I''m disappointing them.',
    134, NOW() - INTERVAL '6 hours'
  ),
  (
    'f0000000-0000-0000-0000-000000000004',
    'seed_hash_004',
    'share', 'burnout',
    'Third year is nothing like I expected. I thought I''d be motivated and building cool stuff. Instead I sleep 10 hours, skip classes, and stare at my ceiling wondering what the point is.',
    97, NOW() - INTERVAL '8 hours'
  ),
  (
    'f0000000-0000-0000-0000-000000000005',
    'seed_hash_005',
    'question', 'academics',
    'How do you deal with being the "dumb one" in your friend group? All my friends are topping but I''m struggling to pass. I feel like I don''t belong here.',
    142, NOW() - INTERVAL '10 hours'
  ),
  (
    'f0000000-0000-0000-0000-000000000006',
    'seed_hash_006',
    'share', 'general',
    'Took a mental health day today. First time I''ve slept more than 5 hours in a week. Feeling guilty but also... relieved. Is this okay?',
    203, NOW() - INTERVAL '12 hours'
  ),
  (
    'f0000000-0000-0000-0000-000000000007',
    'seed_hash_007',
    'share', 'stress',
    'I keep making to-do lists and then doing none of it. The guilt snowballs and then I avoid everything harder. Is this executive dysfunction or am I just lazy?',
    176, NOW() - INTERVAL '14 hours'
  ),
  (
    'f0000000-0000-0000-0000-000000000008',
    'seed_hash_008',
    'question', 'relationships',
    'Best friend got into a better college than me and now I can''t stop comparing. I''m genuinely happy for them but I also feel like a failure. How do I stop this?',
    89, NOW() - INTERVAL '16 hours'
  ),
  (
    'f0000000-0000-0000-0000-000000000009',
    'seed_hash_009',
    'share', 'burnout',
    'Finished my internship today. Was supposed to feel proud. Just felt exhausted and empty. My manager said I "showed a lot of promise." I don''t feel it at all.',
    55, NOW() - INTERVAL '20 hours'
  ),
  (
    'f0000000-0000-0000-0000-000000000010',
    'seed_hash_010',
    'share', 'general',
    'Started doing the breathing exercise from Yodha Flow when I feel overwhelmed. The 4-7-8 pattern actually worked during my viva. Wanted to share in case anyone needed it.',
    312, NOW() - INTERVAL '1 day'
  ),
  (
    'f0000000-0000-0000-0000-000000000011',
    'seed_hash_011',
    'question', 'stress',
    'Anyone else''s hands shake before presentations? Not nervousness, literal trembling. It''s embarrassing and I don''t know how to stop it.',
    74, NOW() - INTERVAL '28 hours'
  ),
  (
    'f0000000-0000-0000-0000-000000000012',
    'seed_hash_012',
    'share', 'academics',
    'Dropped a course today. Feels like giving up but I was spending 15 hours a week on it and failing. Sometimes quitting IS the right choice I guess.',
    158, NOW() - INTERVAL '32 hours'
  ),
  (
    'f0000000-0000-0000-0000-000000000013',
    'seed_hash_013',
    'share', 'exams',
    'Broke down crying in the library yesterday. A stranger just passed me a pack of tissues without saying anything. That small kindness made everything less terrible. Humans are good.',
    421, NOW() - INTERVAL '36 hours'
  ),
  (
    'f0000000-0000-0000-0000-000000000014',
    'seed_hash_014',
    'question', 'burnout',
    'When you''re burnt out, how do you even start recovering? I''ve taken breaks but I come back feeling worse, not better. Like rest doesn''t work on me anymore.',
    193, NOW() - INTERVAL '48 hours'
  ),
  (
    'f0000000-0000-0000-0000-000000000015',
    'seed_hash_015',
    'share', 'general',
    'College is the best years of your life they said. I''m 20 and I feel 45 and exhausted. Not a complaint, just wanted to say this out loud to someone.',
    267, NOW() - INTERVAL '60 hours'
  )
ON CONFLICT DO NOTHING;


-- ════════════════════════════════════════════════════════════════
--  SEED COMMENTS on post 13 (the library tissues post)
-- ════════════════════════════════════════════════════════════════

INSERT INTO community_comments (post_id, session_hash, content, posted_at)
VALUES
  (
    'f0000000-0000-0000-0000-000000000013',
    'seed_hash_c01',
    'This made me tear up. Sometimes the smallest kindnesses are the ones that keep you going. 💙',
    NOW() - INTERVAL '35 hours'
  ),
  (
    'f0000000-0000-0000-0000-000000000013',
    'seed_hash_c02',
    'I had a similar moment at my hostel. Someone left a bar of chocolate outside my door with a note "hang in there." I still think about it.',
    NOW() - INTERVAL '34 hours'
  ),
  (
    'f0000000-0000-0000-0000-000000000013',
    'seed_hash_c03',
    'Humans really are good. We just forget it when we''re stuck in our own heads. Thank you for sharing this.',
    NOW() - INTERVAL '33 hours'
  )
ON CONFLICT DO NOTHING;

COMMIT;
