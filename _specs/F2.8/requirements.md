# F2.8: CSV Import

## User Story
As a founder, I want to import my contacts from a CSV file so I can populate my CRM quickly without manual entry.

## Acceptance Criteria

### GIVEN a user on the Contacts page
WHEN they click "Import CSV"
THEN a file upload dialog appears

### GIVEN a CSV file with columns: name, email, company, title, phone
WHEN the user uploads it
THEN the system parses the CSV and shows a preview with column mapping

### GIVEN a parsed CSV with mapped columns
WHEN the user confirms the import
THEN contacts are created in the database with linked companies

### GIVEN imported contacts
WHEN the user views the Contacts page
THEN all imported contacts appear in the table

### GIVEN a CSV with 50 rows
WHEN imported
THEN all 50 contacts are created (batch insert)

## Edge Cases
- Empty CSV → show error
- CSV with missing required columns (no email) → show warning
- CSV with special characters (accents, Arabic, CJK) → handle correctly
- Duplicate emails → skip or update existing
- CSV with > 10,000 rows → warn about processing time
- Malformed CSV (unbalanced quotes) → show parse error

## Evaluation Steps
1. Navigate to /contacts
2. Click "Import CSV"
3. Upload test-contacts.csv (50 rows from _fixtures/)
4. Verify column mapping
5. Confirm import
6. Verify all contacts appear in the table
7. Check database directly for data integrity
