-- ============================================================================
-- Migration: Point program_choice selections to program_setup
-- Purpose: PCU first/second choices are courses from program_setup, not departments.
-- ============================================================================

ALTER TABLE program_choice
DROP CONSTRAINT IF EXISTS app_programme_choice_first_choice_fkey,
DROP CONSTRAINT IF EXISTS app_programme_choice_second_choice_fkey;

ALTER TABLE program_choice
ADD CONSTRAINT app_programme_choice_first_choice_fkey
    FOREIGN KEY (first_choice) REFERENCES program_setup(id),
ADD CONSTRAINT app_programme_choice_second_choice_fkey
    FOREIGN KEY (second_choice) REFERENCES program_setup(id);

-- ============================================================================
-- Migration Complete
-- ============================================================================
