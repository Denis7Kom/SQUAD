# Supabase foundation — SQUAD COMMAND

This is a preliminary, unconnected foundation, not a production release. The public site remains in local prototype mode.

## Current scope
The initial migration creates profiles, teams and team membership. Users may manage their own profile and create a team through a transaction; team ownership is derived from auth.uid(). Direct team and membership writes are denied. Team and membership reads are intentionally restricted. No sharing, reviews, elections, expiry, transfers, reserve ranks, certificates, moderation, imports or public profiles are implemented.

## Setup and verification
1. Create a separate Supabase Free project, or select the project explicitly intended for SQUAD COMMAND. Do not use a service role or database password in frontend code.
2. Configure authentication and site/redirect URLs for the published site. Public email signup needs a suitable SMTP provider; default Supabase email is not adequate for general users.
3. Test the migration in a disposable local Supabase environment or isolated test project. Verify anonymous access is denied; one authenticated user cannot read or edit another user's profile or team; users cannot insert team members or set owners via direct API; create_team rejects unauthenticated requests and creates an owner membership atomically.
4. Only after access-control tests pass, apply the reviewed migration to the intended Supabase project. Implement and test protected workflows before connecting the public site.
5. Set up encrypted, access-controlled database backups and test restoration. Never store database dumps in a public repository.

Only the project URL and publishable key are appropriate for a browser integration. Secret/service-role keys and database passwords must not be shared in chat, placed in the website, or committed.
