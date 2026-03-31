# F4.2: AI Email Writer — Tasks

## Task 1: Email generation API
- [ ] Create POST /api/emails/generate route
- [ ] Accept contactId, optional context and template
- [ ] Gather contact + company + signals data
- [ ] Generate personalized email via Claude
- [ ] Substitute template variables
- [ ] Verify: Generate email for enriched contact → personalized result
- [ ] Test: Auth, validation, generation, template substitution

## Task 2: Integration with sequence detail page
- [ ] Add "Preview Email" button per enrollment on sequence detail page
- [ ] Show generated email in modal/inline
- [ ] Verify: Preview shows personalized email for each enrolled contact
