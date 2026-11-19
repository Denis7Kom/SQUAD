# Supabase foundation — SQUAD COMMAND

The foundation and online-team migrations were applied to the dedicated SQUAD Free project with explicit owner approval on 2026-11-19. Discord setup is deferred; the public site and online workspace remain in local/disabled mode. This is not a verified production release.

## Current scope
The two migrations create profiles, teams, membership, private invitation codes and member reviews. Team operations derive the caller from auth.uid(), check membership/ownership and enforce limits in transactions. Direct team, membership and review writes are denied. RLS and roster RPCs restrict visibility. Elections, expiry, ownership transfers, reserve ranks, certificates, moderation and local-data imports are not implemented.

## Setup and verification
1. Create a separate Supabase Free project, or select the project explicitly intended for SQUAD COMMAND. Do not use a service role or database password in frontend code.
2. Configure authentication and site/redirect URLs for the published site. Public email signup needs a suitable SMTP provider; default Supabase email is not adequate for general users.
3. Test the migration in a disposable local Supabase environment or isolated test project. Verify anonymous access is denied; one authenticated user cannot read or edit another user's profile or team; users cannot insert team members or set owners via direct API; create_team rejects unauthenticated requests and creates an owner membership atomically.
4. Only after access-control tests pass, apply the reviewed migration to the intended Supabase project. Implement and test protected workflows before connecting the public site.
5. Set up encrypted, access-controlled database backups and test restoration. Never store database dumps in a public repository.

Only the project URL and publishable key are appropriate for a browser integration. Secret/service-role keys and database passwords must not be shared in chat, placed in the website, or committed.

## Online pilot extension

The second migration adds private invitations, member operations and weighted reviews with server-enforced limits. See [deployment and access checks](../docs/12-online-launch.md). It is not deployed by adding files to this directory. CI uses a disposable PostgreSQL auth fixture; never apply the files in tests/ to a hosted Supabase project.
