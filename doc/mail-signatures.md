# Per-mailbox rich-text signatures

In Settings → Email signatures, choose a sending address, edit its signature and save.
Each address independently controls automatic insertion for new messages and for
replies/forwards. The composer also offers Insert signature and a sender selector.

The signature sits below the newly written text and above quoted content. Switching
sender replaces only the managed top-level signature; manually edited signatures
require confirmation. Manually removed signatures stay removed until explicitly
inserted again. Drafts retain the saved body without appending a second signature.

Signatures are stored in D1 (`account_signature`), scoped to the authenticated
owner of a non-deleted account. HTML is sanitized at save time with an allowlist;
formatted text, safe links, tables and PNG/JPEG/GIF/WebP images are supported.
The limit is 512 KiB of UTF-8 HTML including embedded images. Preferences default
to off and the signature defaults to empty for all existing accounts.

## Reference behavior

The interaction design follows Roundcube's sending identities and signature
settings, including the distinct “new messages” vs “forwards and replies” modes
and placement relative to quoted text:

- https://github.com/roundcube/roundcubemail/blob/master/config/defaults.inc.php
  (`show_sig`, `sig_below`, `strip_existing_sig`)
- https://github.com/roundcube/roundcubemail/blob/master/program/js/app.js
  (identity changes and duplicate-signature prevention)

No Roundcube source is copied. MITCO uses its existing Vue and TinyMCE components.

## Migration and deployment

`migrations/20261026_account_signature.sql` is additive and idempotent. The normal
Cloudflare deployment workflow runs it before publishing the Worker. Fresh
installations also create the table in the existing initialization flow. The
previous Worker can run against the new schema, so code rollback does not require
dropping signature data.

## Verification

- `cd mail-worker && pnpm test:unit`: behavior, sanitizer and real SQLite persistence
  tests, including ownership, deleted accounts and migration re-runs.
- `cd mail-vue && pnpm exec playwright install chromium && pnpm test:e2e`:
  browser integration using production bundles of the real Vue components and TinyMCE, with isolated mock
  accounts and HTTP responses. Test fixtures are outside the production build.
- `cd mail-vue && pnpm build`
- `cd mail-worker && pnpm exec wrangler deploy --dry-run`
