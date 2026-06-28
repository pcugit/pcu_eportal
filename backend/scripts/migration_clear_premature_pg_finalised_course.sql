-- Clear PG finalised_course values that were set by applicant form saves
-- before admin review. Reviewed/admitted/recommended rows are left untouched.

UPDATE pg_application
SET finalised_course = NULL,
    updated_date = NOW()
WHERE decision IS NULL
  AND applicant_stage IN ('started', 'in_progress', 'submitted')
  AND finalised_course IS NOT NULL;
