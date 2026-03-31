# F4.1: Sequence Builder — Design

## System Fit
Sequences are Monaco's Step 3: automated outreach. A sequence is a multi-step email campaign with configurable delays. Contacts are enrolled and progress through steps automatically. This is the foundation for F4.2 (AI writer), F4.3 (autopilot), and F4.5 (reply detection).

## Data Model
Need new tables. Add to schema:

### sequences table
- id, tenantId, name, description, status (draft/active/paused/archived), createdAt, updatedAt

### sequence_steps table
- id, sequenceId, stepNumber, subjectTemplate, bodyTemplate, delayDays, createdAt

### sequence_enrollments table
- id, sequenceId, contactId, status (active/paused/completed/replied/bounced), currentStep, enrolledAt, lastStepAt, nextStepAt

## API Contracts

### POST /api/sequences — Create sequence
### GET /api/sequences — List sequences
### GET /api/sequences/[id] — Get sequence with steps and enrollments
### PUT /api/sequences/[id] — Update sequence
### POST /api/sequences/[id]/steps — Add step
### POST /api/sequences/[id]/enroll — Enroll contacts

## UI

### Sequences page (/sequences)
- List of sequences with name, steps, enrolled, status
- "Create Sequence" button

### Sequence detail page (/sequences/[id])
- Sequence name/description
- Steps list (editable)
- Enrolled contacts with status
- "Add Step" and "Enroll Contacts" buttons
