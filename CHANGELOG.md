# Changelog

## 2.1.1-alpha — 2026-11-23

- Keep the online session after temporary network or server failures while refreshing authentication.
- Require the selected player’s reviews to load before saving, preventing a failed request from carrying over another player’s values.
- Clarify that a timed-out write may have succeeded and should be checked after refreshing.

## 2.1.0-alpha — 2026-11-19

- Add an opt-in online team workspace with tab-scoped authentication, profiles, private invitations and shared ratings.
- Add a transactional Supabase migration with RLS, account/team limits, membership controls and server-calculated rating averages.
- Enable Discord sign-in on the draft branch after provider configuration; hosted acceptance checks remain pending.
- Preserve online navigation and load existing review values before editing.
- Cache the online interface shell without caching authentication or database requests.

## 2.0.3-alpha — 2026-11-14

- fix(ui): keep version readable in the SQUAD screen corner (574749c)

## 2.0.2-alpha

- Baseline for automatic semantic versioning.
