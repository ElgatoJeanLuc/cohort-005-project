# What would sending Email take for Cadence?

Research for issue #3 (child of #1 "Notifications spec"). It gathers facts for the
decision in #7 ("Is Email worth building in this effort?") and does not make that decision.

All sources were accessed on **2026-11-11**. Prices and policies change; re-check the
linked pages before relying on a number. Where a statement is my own assessment rather than
something a source says, it is marked **(assessment)**.

## Where Cadence is today

- There is no mail transport. `app/routes/courses.$slug.refund.ts` builds a plain-text
  confirmation (`buildReversalEmail`) and writes it to the server log with
  `console.log("[email] to=... subject=...")`. Nothing else in `app/` sends mail.
- Users have one `email` column (`app/db/schema.ts`, `users` table). There is no
  notification-preference, unsubscribe or suppression data.
- `app/routes/signup.tsx` takes a name and an email with no password and no address
  verification; an existing address silently logs that person in. Any address typed there
  would become a recipient.
- Seeded users have addresses on real public domains (`student.dev`, `ralph.dev`), so local
  dev must never deliver real mail to them.
- Config comes from `process.env` ad hoc (e.g. `DISCORD_INVITE_URL`); there is no env schema
  and no deployment config in the repo. The server is a single process (`react-router-serve`)
  on SQLite; there is no job queue.
- `GLOSSARY.md` (Notifications): every Notification goes In-app; Email and Push are extra
  copies "a user can turn off". So an Email off-switch per user is required by our own
  language, independent of the law.

## 1. Options and cost at small volume (up to ~10k emails/month)

| Option | Free / dev tier | Cost at 10k/month | Notes |
| --- | --- | --- | --- |
| **Postmark** | 100 emails/month, no expiry | **$15/mo** (Basic, 10k included; overage $1.80/1k) | Pro $16.50, Platform $18 at 10k. Dedicated IP from $50/mo, only for 300k+/month. [1] |
| **Resend** | 3,000/month, **capped at 100/day**, 3 domains | **$20/mo** (Pro, 50k included; overage $0.90/1k) | Free tier cannot cover 10k/month. Marketing ("Broadcasts") priced separately by contacts. 30-day data retention. [2] |
| **Amazon SES** | New AWS accounts get up to $200 credits (6-month free plan) | **~$1/mo** à la carte ($0.10 per 1,000) | Also plan pricing ($0.16–$0.23/1k). Attachments $0.12/GB. Dedicated IP $24.95/mo. New accounts start in a sandbox (see §5). [3][4] |
| **Mailgun** | 100 emails/day | **$15/mo** (Basic, 10k included; overage from $1.80/1k) | Listed as a further comparable. [5] |
| **Self-hosted SMTP (own MTA)** | n/a | No per-message fee; cost is a server plus operations time | See "Sending ourselves" below. |

### Sending ourselves (own SMTP server)

Facts that apply if Cadence ran its own outbound MTA instead of a provider:

- Gmail and Yahoo require, for **all** senders, valid forward and reverse DNS (PTR) for the
  sending IP, TLS, SPF or DKIM, and a spam rate under 0.3%. [6][7] With a provider these are
  the provider's job; self-hosted they are ours.
- Common clouds restrict outbound port 25: Google Compute Engine blocks it to destinations
  outside the VPC and recommends a third-party provider instead [8]; AWS EC2 throttles port
  25 until you ask for removal [4].
- We would do our own DKIM signing (≥1024-bit keys required by Gmail, 2048 recommended [6]),
  parse bounce DSNs ourselves, and have no provider feedback loops for complaints.
- **(assessment)** A new IP with no sending history has no reputation; deliverability work
  (warm-up, blocklist monitoring) is ongoing operations, not a one-off task. For ~10k/month
  this costs far more engineering time than the $1–$20/month a provider charges.

A middle path that is still "SMTP": use **a provider's SMTP relay** (all four providers
above advertise one; not checked page by page here) through a generic library such as
Nodemailer, which keeps the app code provider-neutral. Nodemailer also has an SES transport over `@aws-sdk/client-sesv2`. [9]

## 2. Sending-domain setup (SPF, DKIM, DMARC)

Standards: SPF is RFC 7208, DKIM is RFC 6376, and DMARC is now **RFC 9989** (Proposed
Standard, May 2026), which obsoletes RFC 7489 and RFC 9091. [10]

What receivers require:

- **All senders** (Gmail): SPF **or** DKIM. [6] (Yahoo: the same.) [7]
- **Bulk senders** (Gmail: close to 5,000 messages/day to personal Gmail accounts, counted
  across the primary domain and its subdomains; once reached, bulk status is permanent):
  SPF **and** DKIM, a DMARC record (`p=none` is acceptable), and the visible `From:` domain
  aligned with the SPF or DKIM domain. [6][11] Yahoo's bulk rules match and strongly
  recommend a DMARC `rua` reporting address. [7]
- At ~10k/month Cadence would be far below 5,000/day, so only the all-sender rules apply
  today. **(assessment)** Doing SPF + DKIM + DMARC from day one costs a few DNS records and
  avoids a migration later.

What each provider asks for in DNS:

- **Postmark**: one DKIM TXT record plus a Return-Path CNAME (default `pm-bounces` →
  `pm.mtasv.net`) for SPF alignment. Verification can take up to 48 hours. [12]
- **Resend**: a DKIM TXT record at `resend._domainkey`, plus an MX and an SPF TXT record on a
  `send` subdomain (the example values point at Amazon SES). Resend recommends sending from
  a subdomain (e.g. `updates.example.com`) to isolate reputation. [13]
- **SES**: Easy DKIM (CNAME records) for DKIM alignment; a custom MAIL FROM domain for SPF
  alignment (the default MAIL FROM is an SES-owned domain, so SPF alone will not align).
  AWS recommends rolling DMARC out `p=none` → `quarantine` → `reject`. [14]
- **DMARC** is a TXT record at `_dmarc.<domain>`, e.g.
  `v=DMARC1; p=none; rua=mailto:dmarc@<domain>`. [14]

## 3. Transactional vs marketing — and what that means for unsubscribe

| Rule set | Transactional / service messages | Marketing / commercial messages |
| --- | --- | --- |
| **CAN-SPAM (US)** [15] | "Primary purpose" test. Messages that facilitate an agreed transaction or update an ongoing relationship are transactional; only the ban on false or misleading routing information applies. Read narrowly. | Accurate headers, honest subject, ad disclosure, valid physical postal address, clear opt-out, opt-out honoured within **10 business days**, opt-out working for **30 days** after sending. Up to $53,088 per violating email. Using a provider does not transfer responsibility. |
| **EU ePrivacy Art. 13 / UK PECR** [16][17] | Service messages ("administrative or customer service purposes", no promotion) are not direct marketing. Any promotional element, even a minor one, makes it direct marketing; branding/logos alone do not. [18] | Prior consent required for individuals, except the "soft opt-in": existing customers, our own similar products, opt-out offered at collection **and in every message**. |
| **GDPR / UK GDPR** [19][20] | Sending what a contract needs (e.g. a Refund outcome) can rest on the *contract* lawful basis, if it is genuinely necessary. | **Absolute** right to object to direct marketing: must stop, should suppress (not delete) the address, and must tell people of the right clearly by the first communication. |
| **Gmail** [6][11] | One-click unsubscribe is **not required** for transactional messages (examples: password resets, reservation and form confirmations). | Bulk senders: marketing and *subscribed* messages must support one-click unsubscribe (RFC 8058) and have a visible unsubscribe link; honour within **48 hours**. |
| **Yahoo** [7] | Same split as Gmail. | Bulk senders: `List-Unsubscribe` with one-click (RFC 8058 POST highly recommended, mailto acceptable), a visible link in the body, processed within **2 days**. |

**RFC 8058 one-click** [21], if we implement it:

- Exactly one `List-Unsubscribe` header containing one HTTPS URI (mailto may also be present)
  and exactly one `List-Unsubscribe-Post: List-Unsubscribe=One-Click` header.
- Both headers must be covered by a valid DKIM signature.
- The URI must identify recipient and list with a hard-to-forge token, because the
  receiver's POST carries **no cookies or auth**.
- The endpoint must handle a POST and **must not redirect**.

How this maps to Cadence (facts plus **(assessment)** where marked):

- Notifications about a user's own Purchase or Refund Request fit the transactional/service
  definitions above. Instructor Q&A replies and similar "something happened" messages are
  likely "updates on an ongoing relationship" **(assessment)**; they stay transactional only
  if they carry no promotion.
- Anything that promotes a course (new course launches, sales, "you might like") is
  marketing under all of the above and would need consent (EU/UK), a postal address
  (CAN-SPAM) and an unsubscribe in every message.
- Gmail's "subscribed messages" category is not defined on the page; a Notification a user
  can turn off arguably looks like one **(assessment)**. Because `GLOSSARY.md` already
  requires a per-user Email off-switch, adding RFC 8058 headers that flip that switch costs
  little and removes the ambiguity. Postmark explicitly allows List-Unsubscribe headers on
  transactional streams. [22]
- Postmark separates mail into **Transactional** and **Broadcast** message streams; on
  Broadcast streams it adds the unsubscribe link and RFC 8058 headers itself and suppresses
  per stream. [22] SES asks at production-access time whether you send mainly marketing or
  transactional mail. [4]

## 4. Bounces and complaints

- **Thresholds.** Gmail/Yahoo: spam rate under 0.3%, aim for under 0.1%. [6][7] SES: bounce
  rate ≥5% puts the account under review, ≥10% may pause sending; complaint rate ≥0.1%
  review, ≥0.5% may pause. Only hard bounces count. [23]
- **What we must do.** Stop sending to hard-bounced and complaining addresses immediately
  (SES: "Do not even send an email that says you've received the request to unsubscribe"). [23]
  SES makes having a bounce/complaint process a condition of leaving the sandbox. [4]
- **Postmark**: Bounce webhook (JSON: `Type`/`TypeCode`, `Email`, `Inactive`,
  `CanActivate`, `MessageStream`, metadata) and a separate Spam Complaint webhook. Hard
  bounces deactivate the address. Retries on non-2xx, so events can arrive more than once
  (dedupe on `X-PM-Webhook-Trace-Id`). Webhooks are **not signed**; Postmark recommends HTTP
  Basic Auth plus IP allow-listing. [24]
- **Resend**: webhook events include `email.bounced`, `email.complained`,
  `email.delivered`, `email.failed`, `email.suppressed`; failed deliveries can be retried and
  replayed. [25][26] Hard bounces and complaints go on an account-wide suppression list
  automatically; Gmail does not send complaint events. [27]
- **SES**: bounces/complaints arrive by email forwarding, an SNS topic, or event publishing
  (configuration sets → SNS/Firehose). If none is set up, SES forwards them to the
  Return-Path address. [28] Wiring SNS to Cadence means an HTTPS subscription endpoint and
  AWS-side setup. Complaint addresses may be redacted by some providers, so keep our own map
  of message ID → user. [23]
- **(assessment)** With any hosted provider, the provider's own suppression list already
  blocks repeat sends, so Cadence's minimum is: receive the webhook, mark the user's Email
  Channel as undeliverable, and show that in settings. Self-hosted, we would build all of
  it, including DSN parsing.
- **(assessment)** Signup has no address verification today, so typo'd or someone-else's
  addresses will bounce or complain. Verifying the address before sending email Notifications
  is the main lever on bounce rate.

## 5. Local dev and tests

Options, from lightest to heaviest:

1. **Log transport (what Cadence does now).** Keep `console.log` of the rendered message as
   the default when no provider key is set. Nodemailer's `jsonTransport` / `streamTransport`
   build the full message (JSON or raw RFC 822) without sending, which is useful for
   snapshot tests. [29]
2. **Local SMTP catcher: Mailpit.** Single static binary or Docker image, MIT-licensed; SMTP on
   `1025`, web UI on `8025`; has a REST API for tests, HTML-compatibility, link and spam
   checks. [30][31] Lets developers see HTML rendering without any account.
3. **Provider sandboxes.** Postmark: the `POSTMARK_API_TEST` token validates calls without
   sending; Sandbox Mode servers exercise bounces and webhooks; `bounce-testing.postmarkapp.com`
   addresses generate fake bounces. [32] Resend: `delivered@`, `bounced@`, `complained@`,
   `suppressed@resend.dev` simulate outcomes (they count against quota). [33] SES: the
   sandbox only sends to verified addresses or the mailbox simulator, 200/day, 1/second. [4]

**(assessment)** Because seed users have addresses on real public domains, the safe default
is: no provider key → log (and optionally Mailpit); a provider key is only set in
production. Tests use an in-memory fake transport and assert on what was "sent".

## 6. Rough effort estimate for this codebase (assessment)

Assumes a hosted provider, plain-text plus simple HTML templates, one developer familiar with
the codebase. Person-days; ranges reflect choices still open in #1.

| Piece | Estimate | Notes |
| --- | --- | --- |
| Email transport seam (`app/lib/email.server.ts`): log / Mailpit / provider, chosen by env; test fake | 0.5–1 d | Replaces the `console.log` in the refund route. |
| Provider account, API key in env, sending domain DNS (DKIM, Return-Path/MAIL FROM, DMARC `p=none` + `rua`) | 0.5 d hands-on | Elapsed time: DNS up to 48 h (Postmark), SES production access up to 96 h. [12][4] |
| Per-user Email Channel off-switch: schema + migration + seed + settings UI | 1–2 d | Required by `GLOSSARY.md` anyway; shared with the In-app/Push preference work. |
| Unsubscribe: signed token, RFC 8058 POST resource route (no auth, no redirect), GET confirmation page, headers on each email | 1 d | Small if it just flips the off-switch above. |
| Bounce/complaint webhook route + "undeliverable" flag, skip sending when set | 1 d | Auth via Basic Auth (Postmark) or signature check (Resend); SES adds SNS subscription handling (+0.5–1 d). |
| Delivery reliability: send after the DB write; either fire-and-forget with logging, or an SQLite outbox + in-process retry loop | 0.5–2 d | No job queue exists; outbox is the larger option. |
| Templates for the Notifications in scope + tests | 1 d | Grows with the number of Notification types. |
| **Total, hosted provider** | **~5–8 d** | Of which ~2–3 d (preferences, unsubscribe) is needed for any Channel a user can turn off. |
| **Self-hosted MTA** | **+ weeks, then ongoing ops** | PTR/rDNS, port 25 egress, DKIM signing, DSN parsing, reputation monitoring. [6][8] |

Not included: address verification at signup (≈1–2 d, see §4), marketing email (consent
capture, CAN-SPAM postal address, broadcast stream), and production hosting (the repo has no
deployment config, so where the webhook endpoints are reachable is undecided).

## Provider shortlist (facts, not a decision)

- **Postmark** — transactional-first; $15/mo at 10k; separate Transactional/Broadcast
  streams with managed one-click unsubscribe on Broadcast; good test tooling (test token,
  Sandbox Mode, bounce test addresses); webhooks unsigned (Basic Auth + IP allow-list).
- **Resend** — $20/mo for 50k (free tier capped at 100/day, so too small for 10k/month);
  simple API, test addresses, automatic suppression list; DNS records point at Amazon SES.
- **Amazon SES** — about $1/mo at 10k, the cheapest by far; most setup (AWS account, IAM,
  sandbox exit review up to 96 h, SNS for bounces/complaints, custom MAIL FROM).
- **Mailgun** — $15/mo at 10k; comparable alternative, not researched in depth here.
- **Self-hosted SMTP** — no per-message fee but takes on PTR, port 25, DKIM, bounce parsing
  and reputation ourselves.

## Sources (accessed 2026-11-11)

1. Postmark pricing — https://postmarkapp.com/pricing
2. Resend pricing — https://resend.com/pricing
3. Amazon SES pricing — https://aws.amazon.com/ses/pricing/
4. Amazon SES, Request production access (sandbox limits; EC2 port 25 note) — https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html
5. Mailgun pricing — https://www.mailgun.com/pricing/
6. Google, Email sender guidelines — https://support.google.com/a/answer/81126
7. Yahoo Sender Hub, Best practices / requirements — https://senders.yahooinc.com/best-practices/
8. Google Cloud, Sending email from an instance (port 25) — https://docs.cloud.google.com/compute/docs/tutorials/sending-mail
9. Nodemailer, SES transport — https://nodemailer.com/transports/ses
10. IETF Datatracker, draft-ietf-dmarc-dmarcbis → RFC 9989 — https://datatracker.ietf.org/doc/draft-ietf-dmarc-dmarcbis/ ; SPF RFC 7208 — https://www.rfc-editor.org/rfc/rfc7208 ; DKIM RFC 6376 — https://www.rfc-editor.org/rfc/rfc6376
11. Google, Email sender guidelines FAQ — https://support.google.com/a/answer/14229414
12. Postmark, How do I verify a domain? — https://postmarkapp.com/support/article/how-do-i-verify-a-domain ; Getting started — https://postmarkapp.com/support/article/1002-getting-started-with-postmark
13. Resend, Domains — https://resend.com/docs/dashboard/domains/introduction ; DNS guide (Cloudflare example) — https://resend.com/docs/knowledge-base/cloudflare
14. Amazon SES, Complying with DMARC — https://docs.aws.amazon.com/ses/latest/dg/send-email-authentication-dmarc.html
15. FTC, CAN-SPAM Act: A Compliance Guide for Business — https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business
16. Directive 2002/58/EC (ePrivacy), Art. 13 — https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32002L0058 (the page did not render for automated fetching; Art. 13 content cross-checked against the ICO's PECR guidance, which implements it in the UK)
17. ICO, Electronic mail marketing (PECR) — https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/electronic-and-telephone-marketing/electronic-mail-marketing/
18. ICO, Identify direct marketing (service messages) — https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/direct-marketing-guidance/identify-direct-marketing/
19. ICO, Right to object — https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/individual-rights/right-to-object/
20. ICO, Lawful basis: contract — https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/a-guide-to-lawful-basis/contract/
21. RFC 8058, Signaling One-Click Functionality for List Email Headers — https://www.rfc-editor.org/rfc/rfc8058.html
22. Postmark, How to include a List-Unsubscribe header — https://postmarkapp.com/support/article/1299-how-to-include-a-list-unsubscribe-header ; How to add an unsubscribe link — https://postmarkapp.com/support/article/1208-how-to-add-an-unsubscribe-link
23. Amazon SES, Sending review process FAQs (bounce/complaint thresholds) — https://docs.aws.amazon.com/ses/latest/dg/faqs-enforcement.html
24. Postmark, Bounce webhook — https://postmarkapp.com/developer/webhooks/bounce-webhook
25. Resend, Webhooks — https://resend.com/docs/dashboard/webhooks/introduction
26. Resend, Webhook event types — https://resend.com/docs/dashboard/webhooks/event-types
27. Resend, Email suppressions — https://resend.com/docs/dashboard/emails/email-suppressions
28. Amazon SES, Setting up event notifications — https://docs.aws.amazon.com/ses/latest/dg/monitor-sending-activity-using-notifications.html
29. Nodemailer, Stream / JSON transport — https://nodemailer.com/transports/stream
30. Mailpit — https://mailpit.axllent.org/
31. Mailpit on GitHub (ports, license) — https://github.com/axllent/mailpit
32. Postmark, Best practices for testing your emails — https://postmarkapp.com/support/article/1213-best-practices-for-testing-your-emails-through-postmark
33. Resend, Send test emails — https://resend.com/docs/dashboard/emails/send-test-emails
