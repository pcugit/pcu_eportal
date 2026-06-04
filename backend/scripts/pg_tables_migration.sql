-- ============================================================================
-- PG (Postgraduate) Application Tables Migration
-- Run this script against your PostgreSQL database to create the PG tables.
-- ============================================================================

-- Ensure uuid-ossp extension is available for uuid_generate_v4()
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ────────────────────────────────────────────────────────────────────────────
-- 1. pg_program_setup — Postgraduate programs available for application
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pg_program_setup (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    faculty_id      INTEGER REFERENCES faculties(id),
    department_id   INTEGER REFERENCES departments(id),
    degree_id       INTEGER REFERENCES degrees(id),
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. pg_reference — Three referees for a PG applicant
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pg_reference (
    id          SERIAL PRIMARY KEY,
    name1       VARCHAR(255),
    address1    TEXT,
    name2       VARCHAR(255),
    address2    TEXT,
    name3       VARCHAR(255),
    address3    TEXT
);

-- ────────────────────────────────────────────────────────────────────────────
-- 3. nextofkin_sponsor — Next-of-kin and sponsor details
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nextofkin_sponsor (
    id                  SERIAL PRIMARY KEY,
    name                VARCHAR(255),
    address             TEXT,
    sponsor_name        VARCHAR(255),
    sponsor_address     TEXT,
    phone_number        VARCHAR(30),
    secondary_number    VARCHAR(30),
    created_date        TIMESTAMP DEFAULT NOW(),
    updated_date        TIMESTAMP DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 4. pg_application — Main postgraduate application record
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pg_application (
    uuid                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id                 UUID REFERENCES users(id),
    surname                 VARCHAR(255),
    first_name              VARCHAR(255),
    middle_name             VARCHAR(255),
    email                   VARCHAR(255),
    date_of_birth           DATE,
    address                 TEXT,
    gender                  VARCHAR(20),
    previous_institution    VARCHAR(255),
    department              VARCHAR(255),
    previous_course         VARCHAR(255),
    class_of_degree         VARCHAR(100),
    proposed_course         INTEGER REFERENCES pg_program_setup(id),
    proposed_faculty_id     INTEGER REFERENCES faculties(id),
    degree_id               INTEGER REFERENCES degrees(id),
    area_of_specialisation  VARCHAR(255),
    proposed_research_title VARCHAR(500),
    mode_of_study           VARCHAR(100),
    physically_challenged   VARCHAR(500),  -- 'no' or the reason text
    pg_reference_id         INTEGER REFERENCES pg_reference(id),
    nextofkin_sponsor_id    INTEGER REFERENCES nextofkin_sponsor(id),
    phone_number            VARCHAR(30),
    secondary_phone_number  VARCHAR(30),
    created_date            TIMESTAMP DEFAULT NOW(),
    updated_date            TIMESTAMP DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 5. pg_document — Uploaded documents for a PG application
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pg_document (
    id                  SERIAL PRIMARY KEY,
    pg_application_id   UUID REFERENCES pg_application(uuid),
    signature           VARCHAR(500),
    transcript          VARCHAR(500),
    created_date        TIMESTAMP DEFAULT NOW(),
    updated_date        TIMESTAMP DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────────────────────
-- Indexes for common lookups
-- ────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pg_application_user_id ON pg_application(user_id);
CREATE INDEX IF NOT EXISTS idx_pg_document_application ON pg_document(pg_application_id);
CREATE INDEX IF NOT EXISTS idx_pg_program_setup_faculty ON pg_program_setup(faculty_id);
CREATE INDEX IF NOT EXISTS idx_pg_program_setup_department ON pg_program_setup(department_id);
