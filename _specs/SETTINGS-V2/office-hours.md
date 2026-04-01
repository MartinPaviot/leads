# SETTINGS-V2: Office Hours

## Problem Statement
Our Settings page has 3 fixed textareas (company, ICP, product) and a Gmail connect button. Lightfield has 18 settings sections with structured knowledge, custom fields, AI fill modes, notifications, and workspace management. Our Settings looks like a toy.

## Premise Challenge
**Original premise**: "Settings is just where you configure the AI knowledge and email."
**Challenge**: Settings is actually where trust is established. Every privacy control, every data model customization, every AI behavior toggle tells the founder "this product respects my business and gives me control." Lightfield proves this — their Settings IS their competitive moat.

**Counter-argument**: Most early-stage founders won't use 18 settings sections. They want to get started fast, not configure.
**Resolution**: Build the CRITICAL settings that affect product quality (Knowledge, Data model awareness, Agent permissions, Opportunity stage descriptions). Skip the NICE-TO-HAVE ones (custom recorder avatars, workflow builder) for now.

## Alternatives Explored

### A. Replicate Lightfield 1:1 (all 18 sections)
Completeness: 10/10. But this is an ocean — custom field types, MCP connectors, workflow builder. Too much for one sprint.

### B. Build only the 6 CRITICAL settings (recommended)
Completeness: 8/10. Structured Knowledge base, expanded Agent settings, stage descriptions, workspace general, members, domain exclusion. Skip: recording, workflows, API keys, MCP connectors, custom field types.

### C. Keep current + add Knowledge section only
Completeness: 5/10. Minimum viable, but still looks like a toy next to Lightfield.

## Decision: Option B
Build 6 critical settings sections that directly improve product intelligence and trust. Defer recording, workflows, API keys, MCP connectors, custom fields.

## Layer Check
Layer 1 (tried and true): Settings page patterns are standard. Copy the information architecture.
Layer 2 (new): Structured knowledge base is Lightfield's innovation. Adopt it.
Layer 3 (first principles): AI fill modes per field is elegant but requires schema redesign. Defer to later sprint.

## Completeness Target: 8/10
