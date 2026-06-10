-- ============================================================================
-- Migration: Add O'Level Period/Year Columns
-- Purpose: Store Period and Year values from the UTME O'Level form section.
-- ============================================================================

ALTER TABLE academic_qualification
ADD COLUMN IF NOT EXISTS exam_period VARCHAR(50),
ADD COLUMN IF NOT EXISTS exam_year VARCHAR(10),
ADD COLUMN IF NOT EXISTS exam_period1 VARCHAR(50),
ADD COLUMN IF NOT EXISTS exam_year1 VARCHAR(10);

-- ============================================================================
-- Migration Complete
-- ============================================================================
