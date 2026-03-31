# Context7 Documentation
**Captured**: 2026-03-31

## What It Is
Context7 pulls up-to-date, version-specific documentation and code examples from source — places them directly into your prompt. Solves LLMs providing outdated/hallucinated API info.

## How It Works
- Resolves library names, matches versions
- Retrieves relevant documentation segments
- Two modes: CLI + Skills, or MCP server

## Installation
- Quick: `npx ctx7 setup` (OAuth auth, API key gen, skill/MCP config)
- Flags: `--cursor`, `--claude`, `--opencode`
- Manual: server URL `https://mcp.context7.com/mcp`
- Free API keys work; paid for higher rate limits

## MCP Tools

### resolve-library-id
- `query` (required): user's question/task for ranking
- `libraryName` (required): library name to search
- Returns matching libraries with Context7-compatible IDs

### query-docs
- `libraryId` (required): exact Context7 ID (e.g., `/mongodb/docs`)
- `query` (required): question/task for relevant docs
- Returns relevant documentation segments

## CLI Commands
- `ctx7 library <name> <query>`: search index by library name
- `ctx7 docs <libraryId> <query>`: retrieve docs by library ID

## Usage Patterns
- Add "use context7" to prompts for auto-resolution
- Specify library ID: "use library /supabase/supabase for API and docs"
- Version targeting: "How do I set up Next.js 14 middleware? use context7"

## MCP Config for Claude Code
Added to `.mcp.json`:
```json
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp@latest"]
    }
  }
}
```

## Stats
- 51.2k GitHub stars, MIT license
- 90.8% TypeScript
- Regular updates (58 releases)
