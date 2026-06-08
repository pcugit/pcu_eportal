-- ============================================================================
-- Migration: Add Course Recommendation Columns to pg_application
-- Purpose: Support PG course recommendation workflow where applicants can
--          accept admin recommendations or recommend alternatives
-- ============================================================================

-- Ensure the following columns exist (add if missing)

-- 1. applicant_stage — Tracks the application stage in the recommendation workflow
-- Valid values: 'started', 'in_progress', 'submitted', 'screening', 'recommended',
--               'accepted_recommendation', 'applicant_recommended', 'rejected',
--               'admitted', 'accepted', 'enrolled'
ALTER TABLE pg_application
ADD COLUMN IF NOT EXISTS applicant_stage VARCHAR(50) DEFAULT 'started';

-- 2. approved_course — Course recommended by admin (stored as course name string)
ALTER TABLE pg_application
ADD COLUMN IF NOT EXISTS approved_course TEXT;

-- 3. finalised_course — Final course after all approvals (admin or applicant choice)
ALTER TABLE pg_application
ADD COLUMN IF NOT EXISTS finalised_course TEXT;

-- 4. applicant_recommended_course — Alternative course recommended by applicant
--    (only populated if applicant rejects admin recommendation)
ALTER TABLE pg_application
ADD COLUMN IF NOT EXISTS applicant_recommended_course TEXT;

-- Add index for applicant_stage for efficient queries
CREATE INDEX IF NOT EXISTS idx_pg_application_applicant_stage 
ON pg_application(applicant_stage);

-- Add index for applicant_recommended_course for tracking recommendations
CREATE INDEX IF NOT EXISTS idx_pg_application_applicant_recommended 
ON pg_application(applicant_recommended_course)
WHERE applicant_recommended_course IS NOT NULL;

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- After running this migration, the following workflow is supported:
-- 
-- 1. Admin reviews application and decides to recommend a course
--    → Sets approved_course = [course_name], applicant_stage = 'recommended'
--
-- 2. Applicant receives notification and can either:
--    a) Accept: applicant_stage = 'accepted_recommendation'
--    b) Recommend alternative: applicant_stage = 'applicant_recommended',
--                             applicant_recommended_course = [their_choice]
--
-- 3. Admin reviews applicant's choice and can:
--    a) Accept it: finalised_course = applicant_recommended_course,
--                  applicant_stage = 'admitted'
--    b) Keep original: finalised_course = approved_course,
--                      applicant_stage = 'admitted'
-- ============================================================================
