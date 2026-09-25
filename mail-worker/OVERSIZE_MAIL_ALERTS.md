# Oversized incoming mail alerts

The `*/5 * * * *` Worker schedule queries Cloudflare Email Routing analytics for the
`Email data size exceeded` error. Cloudflare rejects these messages before the mail
Worker runs, so an incoming-email handler cannot see them. The monitor writes a
small trilingual notice directly to the original MITCO recipient's Cloud Mail inbox
and to `admin@mitcoasia.com`. It does not send the rejected message or attachments.

Each Cloudflare `sessionId` is stored in `oversized_mail_alert`, so repeated polls
do not create duplicate notices. Separate SMTP retry attempts have separate IDs
and each gets a notice. The poll looks back 24 hours to recover from brief outages.
On its first scheduled run it begins 15 minutes before that run; historical
events are not replayed. The notice includes the sender, recipient, UTC event time,
25 MiB limit, and Cloudflare event ID. The original subject, content, and exact
size are unavailable at this rejection stage.

## Setup

1. Create a Cloudflare API token with **Zone > Analytics > Read**, with Zone
   Resources limited to the specific zone `mitcoasia.com`. Verify that this
   token can query the Email Routing GraphQL dataset before deployment.
   Store it as the GitHub Actions repository secret
   `EMAIL_ROUTING_ANALYTICS_TOKEN`. Never put the token in the repository or a
   Wrangler `[vars]` section.
2. The deploy workflow applies `migrations/20260925_oversize_mail_alert.sql`
   to the existing D1 binding before deployment and installs the token as the
   Worker secret `email_routing_analytics_token` afterwards. The workflow fails
   before deployment if the GitHub secret is absent.
3. Run the local unit test with its synthetic GraphQL fixture, then check a
   scheduled run in Worker logs. On the next genuine oversized-mail event,
   verify the two MITCO inboxes and the `oversized_mail_alert` row.

The GraphQL Analytics dataset can be sampled or delayed, so this monitor is
best effort. A query returning 1000 events in 24 hours fails visibly in the Worker
logs instead of silently discarding older events. The 24-hour recovery window
does not cover an outage longer than one day.
