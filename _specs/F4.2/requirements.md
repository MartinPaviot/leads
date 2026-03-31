# F4.2: AI Email Writer — Requirements

## User Story
As a founder, I want the AI to generate personalized cold emails for each contact using enrichment data, signals, and context so I don't have to write each email manually.

## Acceptance Criteria

### AC1: Generate email for contact
GIVEN a contact with enrichment data
WHEN I click "Generate Email" or the system generates for a sequence step
THEN a personalized email is generated with subject + body

### AC2: Context-aware personalization
GIVEN enrichment data (title, company, industry) and signals
WHEN generating an email
THEN the email references specific details about the contact and their company

### AC3: Template variable substitution
GIVEN a sequence step template with {{variables}}
WHEN generating for a specific contact
THEN variables are replaced with actual contact/company data

### AC4: Email preview and edit
GIVEN a generated email
WHEN previewing
THEN I can edit before sending/saving

## Edge Cases
- Contact with minimal data → generic but still professional email
- Very long company description → truncate context
- No LLM key → clear error

## Evaluation Steps
1. Generate email for "Sarah Chen, CTO at Meridian Labs"
2. Verify it mentions her title, company, and relevant context
3. Verify template variables are substituted
