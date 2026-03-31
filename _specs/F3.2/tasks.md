# F3.2: Contact Enrichment — Tasks

## Task 1: Create contact enrichment API
- [ ] Create `POST /api/enrich-contacts` route
- [ ] Accept contactIds array
- [ ] Use Claude structured output to generate title, LinkedIn, phone, seniority
- [ ] Associate contact with company if identifiable
- [ ] Update contact record in database
- [ ] Re-embed contact with enriched data
- [ ] Verify: API returns enriched data for "Sarah Chen"
- [ ] Test: Auth check, validation, enrichment flow, skip-if-enriched, batch limit

## Task 2: Wire Inngest auto-enrichment
- [ ] Add `contact/enriched` Inngest function
- [ ] Fire event from contacts API on creation
- [ ] Verify: Creating contact triggers background enrichment

## Task 3: Enhanced contacts page UI
- [ ] Add enrichment status column
- [ ] Add Title, Company columns
- [ ] Add "Enrich" button per row
- [ ] Add "Enrich All" button in header
- [ ] Loading states during enrichment
- [ ] Verify: UI reflects enrichment status
