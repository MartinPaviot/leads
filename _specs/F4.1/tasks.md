# F4.1: Sequence Builder — Tasks

## Task 1: Database schema
- [ ] Add sequences, sequence_steps, sequence_enrollments tables to schema.ts
- [ ] Run migration
- [ ] Verify: Tables exist
- [ ] Test: Schema compiles

## Task 2: Sequences CRUD API
- [ ] POST /api/sequences (create)
- [ ] GET /api/sequences (list with counts)
- [ ] GET /api/sequences/[id] (detail with steps + enrollments)
- [ ] PUT /api/sequences/[id] (update name/status)
- [ ] POST /api/sequences/[id]/steps (add step)
- [ ] POST /api/sequences/[id]/enroll (enroll contacts)
- [ ] Verify: Full CRUD works
- [ ] Test: Auth, validation, CRUD operations

## Task 3: Sequences page UI
- [ ] Create /sequences page with list view
- [ ] Create /sequences/[id] detail page
- [ ] Add step editor
- [ ] Add enrollment UI
- [ ] Add sidebar nav link
- [ ] Verify: Can create sequence, add steps, enroll contacts
