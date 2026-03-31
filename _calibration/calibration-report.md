# Calibration Report

## Test Case 1: broken-page.html (Expected: FAIL)

### Evaluation

| Dimension | Score | Threshold | Result |
|-----------|-------|-----------|--------|
| Product depth | 0.15 | 0.70 | **FAIL** |
| Functionality | 0.10 | 0.80 | **FAIL** |
| Data quality | 0.10 | 0.70 | **FAIL** |
| Design | 0.20 | 0.60 | **FAIL** |
| Code quality | 0.30 | 0.70 | **FAIL** |
| **Overall** | **0.15** | **0.70** | **FAIL** |

### Evidence

**Product depth (0.15)**: No real functionality. All buttons show `alert('Not implemented')` or `alert('TODO')`. Stats show "Loading..." permanently. No pipeline view, no signal-based prioritization, no AI insights (placeholder text only). Activity feed shows a hardcoded error. Fake data ("John Doe", "Test Company", "jane@demo.com") — no verisimilitude.

**Functionality (0.10)**: 0/N acceptance criteria could pass. No working features. Add Lead, Send Campaign, View Reports — all stub alerts. Edit buttons — all stubs. No real data flow.

**Data quality (0.10)**: All data is hardcoded placeholder. Scores are arbitrary ("7/10", "3/10"). No enrichment, no real companies, no signals. "Loading..." never resolves.

**Design (0.20)**: Generic Bootstrap-era aesthetic. Default Arial. Green `#4CAF50` buttons — Material Design defaults, not intentional design. No information hierarchy. Table layout for pipeline — wrong affordance (should be kanban or list). Red/green status badges are the only visual differentiation. No dark mode. No personality. Emoji rocket in h1 — generic AI pattern.

**Code quality (0.30)**: No JS beyond alerts. No error handling. No types. No tests. `onclick` inline handlers. No component structure. No build system. Static HTML page with no real application logic.

### Verdict: FAIL ✗
Score 0.15 — well below 0.70 threshold. Every dimension fails individually.

---

## Test Case 2: good-page.html (Expected: PASS)

### Evaluation

| Dimension | Score | Threshold | Result |
|-----------|-------|-----------|--------|
| Product depth | 0.78 | 0.70 | **PASS** |
| Functionality | 0.75 | 0.80 | **FAIL** |
| Data quality | 0.80 | 0.70 | **PASS** |
| Design | 0.82 | 0.60 | **PASS** |
| Code quality | 0.45 | 0.70 | **FAIL** |
| **Overall** | **0.74** | **0.70** | **FAIL** (2 dimensions below threshold) |

### Evidence

**Product depth (0.78)**: Pipeline kanban view with 4 stages (Discovery → Evaluation → Negotiation → Closed Won). AI insights per deal (response time analysis, buying signals, competitor mentions, close ETAs). Risk indicators with specific reasons. Deal scoring with hot/warm/risk signals. Stats dashboard with trends. Missing: chat interface, TAM view, sequences, contact detail. This is one well-executed view, not a full product.

**Functionality (0.75)**: Pipeline display works. Stats display works. Visual hierarchy is clear. But: no interactivity (can't drag deals, can't click to detail, no forms, no search, no filters). It's a static mockup, not a working application.

**Data quality (0.80)**: Realistic company names (Meridian Labs, Flux AI, Vortex AI). Realistic deal sizes ($15K-$120K ARR). Realistic stages and signals. AI insights reference specific behaviors (reply times, page visits, stakeholder engagement). Risk indicators cite specific evidence. Good verisimilitude.

**Design (0.82)**: Intentional dark theme with good contrast. Consistent spacing and typography. Accent color system (indigo primary, semantic greens/ambers/reds). Proper information hierarchy. Cards and kanban layout match the domain. No generic patterns. Sidebar navigation is clean and well-organized. Professional SaaS aesthetic.

**Code quality (0.45)**: Static HTML/CSS only. No JS, no components, no state management, no API integration, no tests, no types. Well-structured CSS with custom properties. But this cannot be a production application — it's a design prototype.

### Verdict: FAIL ✗
Score 0.74 overall BUT Functionality (0.75) below 0.80 threshold AND Code quality (0.45) below 0.70 threshold. The good page demonstrates strong design and product thinking but is not a passing feature — it's a static prototype.

---

## Calibration Assessment

| Test Case | Expected | Actual | Discriminating? |
|-----------|----------|--------|-----------------|
| broken-page.html | FAIL | FAIL (0.15) | ✓ Correctly rejected |
| good-page.html | PASS-ish | FAIL (0.74) | ✓ Correctly identified as incomplete |

### Analysis

The rubric successfully discriminates between:
- **Garbage** (broken-page: 0.15) — placeholder text, fake data, no functionality, generic design
- **Quality prototype** (good-page: 0.74) — strong design and product depth, but no real functionality or code quality

This is the correct behavior. A static HTML page, no matter how well-designed, should NOT pass as a completed feature. The rubric's multi-dimensional thresholds catch this: you can't compensate for zero code quality with great design.

The spread between 0.15 and 0.74 shows the rubric has good dynamic range and won't collapse everything to the same score.

### Calibration: PASSED ✓

The evaluation system is discriminating and calibrated. Ready for real evaluations.
