# F4.2: AI Email Writer — Design

## System Fit
Email writing is Monaco's Step 3 killer feature: messages adapt to business context and intent signals. Uses enrichment (F3.1/F3.2), signals (F3.5), and RAG context (F2.6) to write emails that feel hand-crafted.

## API Contracts

### POST /api/emails/generate
```typescript
// Request
{
  contactId: string;
  context?: string;  // Optional additional context
  template?: { subject: string; body: string };  // Optional template with {{variables}}
}

// Response 200
{
  subject: string;
  body: string;
  metadata: { tokensUsed: number; model: string }
}
```

## Data Flow
1. Collect contact data (name, title, email, company)
2. Collect company data (industry, size, signals)
3. Collect RAG context if available (previous interactions)
4. Apply template variables if template provided
5. Generate personalized email via Claude
6. Return subject + body for preview/edit

## Template Variables
- {{firstName}}, {{lastName}}, {{fullName}}
- {{title}}, {{company}}, {{industry}}
- {{senderName}}, {{senderCompany}}
