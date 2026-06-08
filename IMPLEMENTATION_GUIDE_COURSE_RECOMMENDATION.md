# PG Course Recommendation Workflow - Implementation Guide

## Overview

This implementation adds a complete course recommendation workflow for Postgraduate (PG) applicants where:

1. Admin recommends courses to applicants
2. Applicants can accept the recommendation or recommend an alternative
3. Admin reviews and makes final decision
4. Application is admitted with finalized course

## Implementation Components

### 1. Database Migration

**File**: `backend/scripts/migration_add_course_recommendation.sql`

**Columns Added to pg_application**:

- `applicant_stage` (VARCHAR(50)): Tracks application stage in recommendation workflow
- `approved_course` (TEXT): Course recommended by admin
- `finalised_course` (TEXT): Final course after all approvals
- `applicant_recommended_course` (TEXT): Alternative course suggested by applicant

**Execution**:

```sql
-- Run against your PostgreSQL database
psql -U <username> -d <database_name> -f backend/scripts/migration_add_course_recommendation.sql
```

### 2. Backend Endpoints

**File**: `backend/routes/applicant.py` (added at end)

#### Endpoint 1: POST `/applicant/accept-recommended-course`

**Purpose**: Applicant accepts admin's recommended course

**Request**:

```json
{
  "applicant_id": "uuid-of-application"
}
```

**Response** (Success):

```json
{
  "message": "Recommended course accepted successfully",
  "new_status": "accepted_recommendation",
  "approved_course": "Master of Science in Computer Science"
}
```

**Status Transitions**:

- **From**: `applicant_stage = 'recommended'`
- **To**: `applicant_stage = 'accepted_recommendation'`
- **Action**: Sets status to waiting for admin finalization

#### Endpoint 2: POST `/applicant/recommend-alternative-course`

**Purpose**: Applicant recommends an alternative course

**Request**:

```json
{
  "applicant_id": "uuid-of-application",
  "alternative_course": "Master of Science in Information Technology"
}
```

**Response** (Success):

```json
{
  "message": "Alternative course recommendation submitted successfully",
  "new_status": "applicant_recommended",
  "original_recommended_course": "Master of Science in Computer Science",
  "applicant_recommended_course": "Master of Science in Information Technology"
}
```

**Status Transitions**:

- **From**: `applicant_stage = 'recommended'`
- **To**: `applicant_stage = 'applicant_recommended'`
- **Stores**: `applicant_recommended_course` with applicant's choice

### 3. Backend Admin Endpoint (pgadmin.py)

**File**: `backend/routes/pgadmin.py` - `/review-application` endpoint

**Already Implemented** - Context-aware decision logic:

```python
# When admin recommends a course:
if decision == 'recommend':
    new_status = 'recommended'
    approved_course = [course]
    finalised_course = None

# When admin accepts after applicant accepted:
if decision == 'accept' AND current_stage == 'accepted_recommendation':
    new_status = 'admitted'
    finalised_course = approved_course

# When admin accepts after applicant recommended alternative:
if decision == 'accept' AND current_stage == 'applicant_recommended':
    new_status = 'admitted'
    finalised_course = applicant_recommended_course
```

### 4. Frontend Components

#### Component 1: CourseRecommendationSection

**File**: `components/CourseRecommendationSection.tsx`

**Features**:

- Shows recommendation status with color-coded sections
- Three states: 'recommended', 'accepted_recommendation', 'applicant_recommended'
- Course selection modal for recommending alternatives
- Action buttons for accepting or recommending alternatives

**Props**:

```typescript
interface CourseRecommendationProps {
  applicantId: string;
  applicationStatus: string;
  approvedCourse?: string;
  applicantRecommendedCourse?: string;
  availableCourses?: Array<{
    id: number;
    name: string;
    course: string;
    department: string;
  }>;
  onAcceptRecommendation?: () => void;
  onRecommendAlternative?: (courseId: number, courseName: string) => void;
  isLoading?: boolean;
}
```

#### Component 2: ApplicantProfile Integration

**File**: `components/ApplicantProfile.tsx` (modified)

**Changes**:

1. Imported `CourseRecommendationSection`
2. Added handlers:
   - `handleAcceptRecommendation()`: Calls POST `/accept-recommended-course`
   - `handleRecommendAlternativeCourse()`: Calls POST `/recommend-alternative-course`
3. Integrated component in JSX (displays after template sections for PG only)

**UI Integration**:

```tsx
{
  program_type_id === 2 && (
    <CourseRecommendationSection
      applicantId={applicant?.id || applicant?.uuid || ""}
      applicationStatus={applicant?.admission_status || ""}
      approvedCourse={applicant?.approved_course}
      applicantRecommendedCourse={applicant?.applicant_recommended_course}
      availableCourses={form?.available_courses || []}
      onAcceptRecommendation={handleAcceptRecommendation}
      onRecommendAlternative={handleRecommendAlternativeCourse}
      isLoading={isProcessingRecommendation}
    />
  );
}
```

## Application Workflow State Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                  ADMIN: Reviews Application                       │
│                  Decides to recommend course                      │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
        ┌──────────────────────────────────────┐
        │   applicant_stage = 'recommended'    │
        │   approved_course = [admin choice]   │
        │   finalised_course = NULL            │
        └──────────────────────────────────────┘
                           │
                    ┌──────┴──────┐
                    │             │
                    ▼             ▼
    ┌─────────────────────┐ ┌──────────────────────┐
    │  Applicant: Accept  │ │ Applicant: Recommend │
    │                     │ │ Alternative Course   │
    └──────────┬──────────┘ └──────────┬───────────┘
               │                       │
    ┌──────────▼────────────┐ ┌────────▼──────────────────┐
    │ applicant_stage =    │ │ applicant_stage =        │
    │ 'accepted_           │ │ 'applicant_recommended'  │
    │ recommendation'      │ │ applicant_recommended_   │
    │ finalised_course=NULL│ │ course = [app choice]    │
    └──────────┬───────────┘ └────────┬─────────────────┘
               │                       │
               │                       │
    ┌──────────▼───────────────────────▼──────────┐
    │   ADMIN: Reviews in applicant-submitted     │
    │         Can accept or reject                 │
    └──────────┬────────────────────────┬──────────┘
               │                        │
        ┌──────▼──────┐         ┌──────▼──────┐
        │Accept       │         │Accept Alt.  │
        │finalized=   │         │finalized=   │
        │approved_c   │         │applicant_rec│
        │stage='admit'│         │stage='admit'│
        └─────────────┘         └─────────────┘
```

## Database Status Values

Valid `applicant_stage` values:

- `'started'` - Initial state
- `'in_progress'` - Form partially filled
- `'submitted'` - Form submitted for screening
- `'screening'` - Admin reviewing
- `'recommended'` - **Admin recommended a course**
- `'accepted_recommendation'` - **Applicant accepted admin choice**
- `'applicant_recommended'` - **Applicant recommended alternative**
- `'rejected'` - Application rejected
- `'admitted'` - Final decision made
- `'accepted'` - Acceptance fee paid
- `'enrolled'` - Enrolled in program

## Testing the Workflow

### 1. Setup Database

```bash
# Run migration
psql -U postgres -d admission_portal -f backend/scripts/migration_add_course_recommendation.sql
```

### 2. Test Admin Recommendation (pgadmin.py)

```bash
curl -X POST http://localhost:5000/api/pgadmin/review-application \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "application_id": "uuid-here",
    "decision": "recommend",
    "approved_course": "Master of Science in Computer Science"
  }'
```

### 3. Test Applicant Accept (applicant.py)

```bash
curl -X POST http://localhost:5000/api/applicant/accept-recommended-course \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"applicant_id": "uuid-here"}'
```

### 4. Test Applicant Alternative (applicant.py)

```bash
curl -X POST http://localhost:5000/api/applicant/recommend-alternative-course \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "applicant_id": "uuid-here",
    "alternative_course": "Master of Science in Information Technology"
  }'
```

## Implementation Checklist

- [x] Database migration file created: `migration_add_course_recommendation.sql`
- [x] Backend endpoints added to `applicant.py`:
  - [x] POST `/accept-recommended-course`
  - [x] POST `/recommend-alternative-course`
- [x] Backend admin logic in `pgadmin.py` (context-aware decisions)
- [x] Frontend component created: `CourseRecommendationSection.tsx`
- [x] Frontend integration in `ApplicantProfile.tsx`
- [ ] **TODO**: Run database migration
- [ ] **TODO**: Test endpoints with real PG application data
- [ ] **TODO**: Verify status mappings in frontend (admission_status)

## Error Handling

### Common Errors and Solutions

**Error**: "Can only accept recommendation when status is 'recommended'"

- **Cause**: Applicant not in correct state
- **Solution**: Admin must first set `applicant_stage='recommended'` with `approved_course`

**Error**: "Alternative course not found"

- **Cause**: Course name doesn't match pg_program_setup
- **Solution**: Verify course name matches exactly (case-insensitive)

**Error**: "Access denied"

- **Cause**: Applicant trying to modify another's application
- **Solution**: Verify user_id matches application owner

## Notes

1. **Status vs Stage**: `admission_status` in dashboard may need mapping to `applicant_stage` values
2. **Course Naming**: Alternative courses are stored as text strings (course names), not IDs
3. **Finalization**: `finalised_course` is set only when decision='admit' is made by admin
4. **Notifications**: Consider adding email notifications for status changes (optional enhancement)
