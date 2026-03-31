# F1.1: Authentication

## User Story
As a founder, I want to sign up and log in to LeadSens so I can start using the GTM engine.

## Acceptance Criteria

### GIVEN a new user visits the app
WHEN they click "Sign up"
THEN they see options for Google OAuth, Microsoft OAuth, and email magic link

### GIVEN a user signs up with Google OAuth
WHEN the OAuth flow completes
THEN their account is created with name and email from Google
AND they are redirected to the onboarding flow

### GIVEN a user signs up with email magic link
WHEN they enter their work email
THEN a magic link is sent to that email
AND clicking the link authenticates them

### GIVEN an authenticated user
WHEN they visit any page
THEN they see their name and avatar in the sidebar
AND they can access their workspace

### GIVEN an authenticated user
WHEN they click "Log out"
THEN they are logged out and redirected to the sign-in page

## Edge Cases
- User tries to sign up with a personal email (gmail, outlook) — allow but note it's a "work email" field
- User clicks magic link after it expires (30 min) — show "link expired" message with resend option
- User tries to access a protected route without auth — redirect to sign-in
- User with existing account tries to sign up again — log them in instead

## Evaluation Steps
1. Visit / → redirected to /sign-in
2. Click "Continue with Google" → Google OAuth popup → redirect to onboarding
3. Enter email → receive magic link → click → authenticated
4. Visit /dashboard → shows user name in sidebar
5. Click "Log out" → redirected to /sign-in
6. Visit /dashboard without auth → redirected to /sign-in
