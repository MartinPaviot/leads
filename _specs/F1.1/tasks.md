# F1.1: Authentication — Tasks

## Task 1: Initialize Next.js project with Turborepo
- [ ] Create monorepo: `apps/web` (Next.js), `packages/db` (Drizzle)
- [ ] Configure TypeScript, ESLint, Prettier
- [ ] Verify: `pnpm dev` starts the app on localhost:3000
- [ ] Test: App renders a "Hello World" page

## Task 2: Install and configure Clerk
- [ ] `pnpm add @clerk/nextjs` in apps/web
- [ ] Create Clerk project at clerk.com, get publishable key + secret key
- [ ] Add to `.env.local`: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY
- [ ] Add Clerk provider to `apps/web/src/app/layout.tsx`
- [ ] Verify: Clerk loads without errors in browser console
- [ ] Test: No Clerk-related console errors on page load

## Task 3: Add Clerk middleware for route protection
- [ ] Create `apps/web/src/middleware.ts` with Clerk auth middleware
- [ ] Configure public routes: /sign-in, /sign-up, /api/webhooks
- [ ] All other routes require authentication
- [ ] Verify: Visiting / without auth redirects to /sign-in
- [ ] Test: Visiting /sign-in works without auth

## Task 4: Create sign-in and sign-up pages
- [ ] Create `apps/web/src/app/(auth)/sign-in/[[...sign-in]]/page.tsx` with Clerk <SignIn />
- [ ] Create `apps/web/src/app/(auth)/sign-up/[[...sign-up]]/page.tsx` with Clerk <SignUp />
- [ ] Style the auth pages (centered, dark theme, LeadSens logo)
- [ ] Configure Clerk to show Google OAuth, Microsoft OAuth, and email
- [ ] Verify: Sign-in page shows 3 auth options
- [ ] Test: Can sign up with email, receive magic link

## Task 5: Create authenticated layout with user info
- [ ] Create `apps/web/src/app/(dashboard)/layout.tsx` with sidebar
- [ ] Show current user name + avatar from Clerk `useUser()`
- [ ] Add "Log out" button using Clerk `useClerk().signOut()`
- [ ] Verify: After sign-in, sidebar shows user name
- [ ] Test: Clicking "Log out" redirects to /sign-in

## Task 6: Set up Clerk webhook for user sync
- [ ] Create `apps/web/src/app/api/webhooks/clerk/route.ts`
- [ ] Verify Clerk webhook signature with `svix`
- [ ] On user.created: insert into users table
- [ ] On user.updated: update users table
- [ ] Verify: After sign-up, user record exists in database
- [ ] Test: User data matches between Clerk and database
