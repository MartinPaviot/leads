# G1: Daily Dashboard — Requirements

## User Story
As a founder doing founder-led sales, I want to open my GTM engine and immediately know what to do today, so I can focus on the highest-impact actions without digging through tabs.

## Acceptance Criteria (GIVEN/WHEN/THEN)

### AC1: Greeting with time context
- GIVEN the user opens the dashboard
- WHEN the page loads
- THEN show "Good morning/afternoon/evening, [first name]" with today's date

### AC2: Weekly performance summary
- GIVEN the user has been using the system
- WHEN the dashboard loads
- THEN show a summary banner: "This week, you've launched X sequences, received Y responses, booked Z meetings, and closed W opportunities."
- EDGE: If all values are 0, show "No activity this week yet. Let's change that."

### AC3: Prioritized action cards with stall detection
- GIVEN there are deals, tasks, and contacts with activity
- WHEN the dashboard loads
- THEN auto-generate prioritized actions (no manual "Get AI Actions" button)
- AND each action card shows: action text, reason, linked deal name + value, stall indicator (if applicable)
- STALL: "Stalled X days" in red if no activity for 3+ days on a deal

### AC4: Today's tasks (real data)
- GIVEN the user has tasks with due dates
- WHEN the dashboard loads
- THEN show tasks due today and overdue tasks with linked account/deal

### AC5: Today's meetings (real data)
- GIVEN the user has meetings scheduled
- WHEN the dashboard loads
- THEN show today's meetings with time, attendee names, and linked account

### AC6: Auto-load on page visit
- GIVEN the user navigates to the dashboard
- WHEN the page renders
- THEN all data (summary, actions, tasks, meetings) loads automatically — no button click needed

## Edge Cases
- New user with zero data: Show welcome message + onboarding prompts
- User with only tasks, no deals: Show tasks, skip deal-related actions
- Weekend: "Happy weekend" greeting variant
- Many actions (10+): Show top 5 with "See all" expandable

## Evaluation Steps
1. Load dashboard with seeded data → verify greeting, summary, actions, tasks, meetings all render
2. Verify stall detection shows for deals with no activity for 3+ days
3. Verify empty states render correctly
4. Run regression tests
