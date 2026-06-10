-- ============================================================================
-- Migration: Link applications to program_choice rows
-- Purpose: Store the selected PCU programme-choice row on applications.
-- ============================================================================

ALTER TABLE applications
ADD COLUMN IF NOT EXISTS program_choice_id INTEGER REFERENCES program_choice(id);

UPDATE applications app
SET program_choice_id = pc.id
FROM program_choice pc
WHERE pc.application_id = app.id
  AND app.program_choice_id IS NULL;

-- ============================================================================
-- Migration Complete
-- ============================================================================
