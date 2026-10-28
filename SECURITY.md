# Security policy

## Reporting a vulnerability

Please do not publish exploit details, sensitive user information, or a working
proof of concept in a public issue.

If private vulnerability reporting is enabled for this repository, use GitHub's
**Security → Advisories → Report a vulnerability** feature. Otherwise, contact
the repository owner privately through an established channel. A private
reporting channel or response time is not guaranteed.

Provide the affected version or commit, reproducible steps, likely impact, and
any suggested mitigation. Do not test against other users' accounts or data
without their permission.

## Current scope

SQUAD COMMAND is a client-side prototype using local browser storage. Client-side
rank checks and local identity controls do not provide authentication,
authorization, protection against duplicate identities, or shared-data security.
Do not store passwords, access tokens, or other secrets in the site or repository.
