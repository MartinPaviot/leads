# Agentic Import — Requirements

## User Story

**As a** founder switching to Elevay from another CRM or spreadsheet,
**I want to** upload my CSV files to the chat and have the AI agent handle the entire import,
**so that** I get a structured, deduplicated, relationship-aware CRM without manually mapping columns or cleaning data.

## Context

Lightfield's agentic import processes 90K records/hour, handles dedup, multi-file stitching, and relationship wiring — all through chat. Elevay has a basic smart import API (`/api/import/smart/`) with LLM column mapping but it lacks: chat integration, deduplication, relationship wiring, multi-file support, progress tracking, and retry-safety.

## Acceptance Criteria

### AC-1: Upload CSV via chat
**GIVEN** the user is in the chat interface
**WHEN** they upload a CSV file (drag-and-drop or file picker)
**THEN** the agent acknowledges the file and begins analyzing its structure
**AND** displays a summary: detected entity type, column count, row count, sample data

### AC-2: Agent proposes mapping with confirmation
**GIVEN** the agent has analyzed a CSV
**WHEN** it presents the proposed mapping (CSV columns → CRM fields)
**THEN** the user can approve, modify, or reject the mapping in natural language
**AND** the agent adjusts based on feedback ("Map 'Company' to account name instead")

### AC-3: Deduplication
**GIVEN** the CSV contains records that already exist in the CRM (matched by email for contacts, domain for accounts)
**WHEN** the import executes
**THEN** existing records are updated (merge) instead of creating duplicates
**AND** the agent reports: X created, Y updated, Z skipped

### AC-4: Relationship wiring
**GIVEN** a CSV with contact data that includes company names/domains
**WHEN** the import executes
**THEN** contacts are automatically associated with existing or newly created companies
**AND** deals are associated with their contacts and companies

### AC-5: Multi-file import
**GIVEN** the user uploads multiple CSVs (companies.csv, contacts.csv, deals.csv)
**WHEN** the agent processes them
**THEN** it stitches the files together using common fields (company name, email domain)
**AND** creates records in dependency order (companies first, then contacts, then deals)

### AC-6: Progress tracking for large imports
**GIVEN** the user uploads a CSV with 10,000+ records
**WHEN** the import is running
**THEN** the chat shows a progress indicator (X/Y records processed)
**AND** the user can continue using the app while the import runs in the background
**AND** a notification appears when the import completes

### AC-7: Retry-safe imports
**GIVEN** an import was interrupted (browser closed, network error)
**WHEN** the user re-uploads the same file or resumes
**THEN** already-imported records are not duplicated
**AND** the import continues from where it left off

### AC-8: Post-import enrichment suggestion
**GIVEN** an import has completed successfully
**WHEN** the results are displayed
**THEN** the agent suggests running enrichment on the imported records ("I can enrich these 150 contacts with LinkedIn data and company info")

## Edge Cases

- CSV with mixed entity types (contacts + companies in one file) → agent splits and imports separately
- CSV with non-English headers → LLM handles French/Spanish/German column names
- Empty rows → skip silently
- Malformed CSV (mismatched columns) → agent reports errors per row, imports valid rows
- Very large file (>5MB) → process in streaming chunks via Inngest background job
- CSV with custom fields not in schema → agent proposes creating custom attributes
- File encoding issues (UTF-8 BOM, Latin-1) → auto-detect and handle
