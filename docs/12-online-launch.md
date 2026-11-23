# Online pilot deployment — 2.1.0-alpha

Status: database migrations applied with explicit owner approval on 2026-11-19; Discord provider and production redirect URL configured on 2026-11-23. The existing public site remains a local prototype. The branch enables the online workspace for acceptance testing; the public site remains unchanged until deployment.

## Free infrastructure
- Keep the public frontend at https://denis7kom.github.io/SQUAD/ on GitHub Pages.
- Dedicated Supabase project: SQUAD, reference `zhorftintgaaxegfhkrm`, Free organisation, West EU (Ireland).
- Use the Free plan only. No paid compute, domain, PITR, branching or other add-on is required.
- Free quotas and inactivity pausing apply. See https://supabase.com/pricing and https://supabase.com/docs/guides/platform/billing-on-supabase.
- The application adds no runtime package, remote SDK, tracker or external script.

## Implemented pilot scope
The Online teams section supports a real account, its own callsign, team creation, private invite codes, joining/leaving, owner removal of a member, code rotation, three review types, and server-calculated averages/counts. Max 5 teams per account and 50 members per team are checked in transactions. Concurrent membership changes lock the team row. Review identity is auth.uid(); duplicate reviews replace the author's existing review for that team, subject and type.

Online teams are separate from historical local rosters. Local records have no verified author identity and are not automatically imported. Online membership does not assign a game rank. Tactical simulation, local hierarchy, candidates, votes, certificates and complaint drafts remain local and do not grant server privileges. This pilot is not a completion of all scenarios in docs/07-acceptance.md.

## Access model
| Table | Read | Write |
| --- | --- | --- |
| profiles | Account reads its own profile; teammates receive only its callsign through team_roster | Account edits its own callsign under RLS |
| teams | Members of that team | create_team RPC derives owner from auth.uid() |
| team_members | Members of that team | create/join/remove RPCs only |
| team_invites | Team owner only | create_team / rotate_team_invite RPC |
| member_reviews | Author reads their own reviews while a member; teammates receive aggregates via RPC | save_member_review RPC; no self reviews; membership foreign keys; unique author/subject/team/type |

All public tables explicitly enable RLS. Anonymous access and direct team/membership/review mutations are denied. Email is not selected or rendered. Removing a member deletes their authored and received reviews in that team. Owner leave/transfer and team deletion are not provided in this pilot.

## Migration and verification order
1. Run the PR's Online database checks and SQUAD tests workflows. The SQL job uses a disposable PostgreSQL database and a minimal auth.uid/auth.users fixture. It exercises real PostgreSQL privileges, constraints and RLS, but does not replace hosted Supabase Auth tests.
2. Review both tracked SQL migrations in order. Do not paste ad-hoc schema edits into the dashboard. Apply migrations using the Supabase CLI's migration workflow or an explicitly approved repository integration.
3. Applying migrations or policies to the intended production project requires the owner's explicit confirmation. Both reviewed migrations were applied with explicit owner approval on 2026-11-19 using the connected Supabase migration tool.
4. Use the access tests in supabase/tests/online_access.sql only against the disposable CI database created with supabase/tests/bootstrap.sql. The bootstrap mocks auth and must NEVER be run on Supabase.
5. On an isolated hosted test environment, verify real sign-in with two independent browsers/accounts and the checks below. Do not open public registration before these pass.
6. Configure an enabled OAuth provider (GitHub or Discord) in the provider's console and Supabase, or configure suitable custom SMTP for verified email signup. Provider secrets belong only in platform settings. Do not disable email confirmation to bypass delivery restrictions. Supabase's built-in mail only sends to organisation-member addresses and is unsuitable for general signup.
7. Set Auth Site URL to https://denis7kom.github.io/SQUAD/ and allow that exact callback URL. Keep redirect allowlists narrow.
8. The public project URL and publishable key are configured in online-config.js; enabled=true and oauthProviders includes discord on this draft branch. Validate the real sign-in flow before deployment. Add only configured provider names to oauthProviders. Email/password login is hidden by emailLogin=false. Set emailSignup=true only after mail delivery and confirmation/recovery have been tested. Session and PKCE data stay in sessionStorage for this tab. OAuth uses PKCE.
9. Review the PR and explicitly authorise any merge/release. Verify the Pages deployment's commit and test its public URL. Updating a branch alone is not deployment verification.

## Hosted acceptance checklist (not yet executed)
- A creates a profile and team; B cannot see it before joining. C cannot read A's profile, roster, invitation or raw reviews.
- A shares an invite with B privately; both see the same roster from separate devices.
- Two parallel joins for the last place result in at most 50 members. Parallel create/join requests do not exceed 5 memberships per account.
- Member B cannot rotate invitations, remove A, directly insert/update memberships, change owner_id or spoof review author.
- Old codes fail immediately after rotation. Joining twice creates one membership.
- Self reviews, out-of-range scores, null scores, wrong array shape and reviews across teams fail when called directly.
- B and C submit distinct reviews after joining; A sees the correct weighted average and count. Updating B's review changes one review, not the count.
- Owner removal/voluntary leave immediately removes access and the associated reviews.
- Expired/revoked sessions, refresh failure, offline requests and lost responses show errors without reporting a successful write.
- Test configured OAuth callback, logout, verified email and password recovery if enabled, and mobile RU/EN layouts.
- Install/update PWA on a real device. Auth/API responses must not enter Cache Storage; online writes must not be queued offline.
- Arrange encrypted database exports outside the public repository and test restoring a separate copy. Supabase Free is not a managed-backup guarantee.

## Validation recorded in this work
- Existing battle engine and battle UI tests passed before changes, including 900 simulated matches.
- Nine online client tests passed locally with mocked HTTP, including PKCE, session refresh, redacted errors, author identity and logout after network failure.
- All three GitHub Actions workflows passed for commit 0dd1c074071fe5e3c7e5adb095eca08c6e2976c8: SQUAD tests (including Linux release idempotency), Online database checks, and Release smoke test. Later changes are checked again in the PR.
- Hosted read-only inspection confirmed RLS enabled on all five public tables and zero profiles after migration.
- Supabase security advisor reports seven intentionally authenticated SECURITY DEFINER functions. Each uses an empty search_path and derives access from auth.uid(); the PostgreSQL access tests exercise their checks. This warning must not be described as zero advisories. See https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable.
- Discord provider is enabled and the exact production site URL is configured. The complete OAuth flow and two-account tests remain pending. No hosted authentication or two-account acceptance flow has passed yet.

## Applied migration history
The connected migration service assigns deployment timestamps. File names are aligned with its ledger, preserving the SQL content that was tested and applied:
- 20261119121439_initial_foundation.sql (original source name: 202610290001_initial_foundation.sql).
- 20261119121455_online_teams.sql (original source name: 202611190001_online_teams.sql).
