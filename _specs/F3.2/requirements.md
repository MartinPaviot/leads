# F3.2: Contact Enrichment — Requirements

## User Story
As a founder, I want my contacts to be automatically enriched with title, company association, LinkedIn, and professional details so I can prioritize outreach without manual research.

## Acceptance Criteria

### AC1: Enrich single contact
GIVEN a contact with just a name and email
WHEN I click "Enrich" on the contact detail row
THEN the LLM fills in title, company, LinkedIn URL, phone (best effort)

### AC2: Batch enrichment
GIVEN multiple contacts without enrichment data
WHEN I click "Enrich All" on the Contacts page
THEN all contacts are enriched in sequence (max 20 per batch)

### AC3: Enrichment visible in table
GIVEN enriched contacts
WHEN I view the Contacts page
THEN enrichment status, title, company, and score columns are visible

### AC4: Auto-enrich on creation
GIVEN a new contact created via UI or CSV import
WHEN the contact is saved
THEN an Inngest event fires to enrich in the background

### AC5: Re-embed after enrichment
GIVEN a contact that was just enriched
WHEN enrichment completes
THEN the contact's embedding is updated with the new data

## Edge Cases
- Contact with no email (enrich by name only — lower confidence)
- Contact already enriched (skip, count as success)
- LLM timeout (30s, skip and mark failed)
- Non-existent contact ID (count as failed)
- Batch >20 (truncate)

## Evaluation Steps
1. Create contact "Sarah Chen, sarah@meridian.com"
2. Call enrichment API
3. Verify title, company association are filled
4. Check database for updated fields
5. Verify embedding was updated
