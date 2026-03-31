# F4.3: Autopilot Enrollment — Design

## API
### POST /api/sequences/[id]/autopilot
```typescript
{ minScore?: number, maxEnroll?: number }
// Response: { enrolled: number, skipped: number, eligible: number }
```

Selects contacts where: score >= minScore, has email, not already enrolled in this sequence. Enrolls up to maxEnroll (default 20).
