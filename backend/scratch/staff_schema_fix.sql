-- ============================================================
-- Staff schema migration
-- Fixes: staff.user_id type, adds missing roles, fixes ICT user
-- ============================================================
BEGIN;

-- 1. Fix staff.user_id: was integer, users.id is uuid
ALTER TABLE staff DROP COLUMN user_id;
ALTER TABLE staff ADD COLUMN user_id uuid REFERENCES users(id) ON DELETE CASCADE;

-- 2. Add status column to users for activate/deactivate support
ALTER TABLE users ADD COLUMN IF NOT EXISTS status varchar(20) NOT NULL DEFAULT 'active';

-- 3. Insert missing roles and their user_types in one shot
WITH new_roles AS (
  INSERT INTO roles (id, name, created_at) VALUES
    (gen_random_uuid(), 'PgDean',    NOW()),
    (gen_random_uuid(), 'Registrar', NOW()),
    (gen_random_uuid(), 'HOD',       NOW()),
    (gen_random_uuid(), 'Lecturer',  NOW()),
    (gen_random_uuid(), 'DEO',       NOW())
  RETURNING id
)
INSERT INTO user_types (role_id, created_at)
SELECT id, NOW() FROM new_roles;

-- 4. Fix ICT user: Admin role → ICTDirector
UPDATE users
SET user_type_id = (
  SELECT ut.id
  FROM user_types ut
  JOIN roles r ON r.id = ut.role_id
  WHERE r.name = 'ICTDirector'
  LIMIT 1
)
WHERE email = 'ict@gmail.com';

COMMIT;
