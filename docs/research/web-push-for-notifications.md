# Research: what would Web Push take for Cadence?

Answers issue #4 (child of map #1, "Notifications spec"). It feeds the decision in #8 ("Is Push worth building in this effort?"). This note collects facts only and makes no decision.

- Researched: 2026-11-11. All sources accessed 2026-11-11.
- Codebase state: `origin/main` @ `7cf5ac3`.
- Unmarked statements come from the cited source. Statements marked **(inference)** are my own reading and are not stated by a source.

## TL;DR

- Cadence has none of the pieces today: no service worker, manifest, VAPID keys or subscription table.
- Web Push has three parts. The browser holds a **subscription**: an endpoint URL plus two keys. Cadence's server holds a **VAPID key pair**. A **service worker** wakes up on each push and shows the notification. The server never talks to the browser directly. It POSTs an encrypted message to the endpoint, which belongs to the browser vendor's push service (Google FCM, Mozilla autopush, Apple, Microsoft).
- Support covers every current engine: Chrome 42+, Edge 17+, Firefox 44+, Safari 16+ on macOS 13 Ventura or later, and iOS/iPadOS 16.4+. **On iPhone and iPad it works only after the user adds Cadence to the Home Screen**, and the site needs a web app manifest with `display: standalone` or `fullscreen`. Inside an ordinary Safari tab on iOS, `Notification` is not even defined. Android WebView and iOS in-app browsers have no support.
- Every major engine requires a user gesture before asking for permission. Firefox and Safari enforce it, and Chrome may hide the prompt behind its "quiet UI" bell icon. Every push must show a visible notification. Safari revokes permission if one doesn't, and Chrome requires `userVisibleOnly: true`.
- Payloads are encrypted (`aes128gcm`, RFC 8291) and limited to about 4 KB: 3993 bytes of plaintext is the guaranteed minimum. The `web-push` npm package (v4.0.0, Node ≥ 16) does the encryption and VAPID signing.
- Expired subscriptions come back as **404 or 410** on send. The server should delete them then.
- It needs a secure context: HTTPS, or `localhost` on the same machine. Cadence's repo has no deployment or HTTPS setup, and no manifest or service worker today.
- **Rough effort: about 4–6 developer-days** for a working Push Channel on top of the Notification model (breakdown below). This excludes HTTPS hosting and the delivery pipeline decided in other tickets. iOS testing needs a real HTTPS origin and a physical device.

## 1. How the pieces fit

1. The page registers a service worker. The worker must be active before the page can subscribe ([MDN Push API][mdn-push]).
2. After a user gesture, the page calls `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`. `applicationServerKey` is Cadence's VAPID public key. "If specified, all messages from your application server must use the VAPID authentication scheme" ([MDN PushManager.subscribe][mdn-subscribe]).
3. The browser returns a `PushSubscription`, which holds an `endpoint` URL plus `p256dh` and `auth` keys. The page sends it to Cadence's server, and the server stores it against the user ([MDN Push API][mdn-push]; [Apple][apple-webpush]: "Store the push notification subscription endpoint and encryption keys together with the user's account information").
4. To notify the user, the server encrypts a payload with the subscription's keys, signs a VAPID JWT, and POSTs to the endpoint ([RFC 8030][rfc8030], [RFC 8291][rfc8291], [RFC 8292][rfc8292]).
5. The push service wakes the browser. The service worker's `push` handler calls `registration.showNotification(...)`, and a `notificationclick` handler opens the right Cadence page ([MDN Push API][mdn-push]).

MDN warns that the endpoint must be kept secret, "or other applications might be able to send push messages to your application." It also warns that "it is vitally important that you protect against CSRF/XSRF issues" when storing subscriptions ([MDN Push API][mdn-push]).

## 2. Service worker in a React Router / Vite app

What Cadence has today:

- `react-router` and `@react-router/serve` are **8.3.0**. The ticket says "React Router 7", but `package.json` pins 8.3.0. Vite is 7.3.7. `react-router.config.ts` sets `ssr: true`.
- There is no service worker, no web app manifest and no `<link rel="manifest">` in `app/root.tsx`. `public/` holds only `favicon.svg` and `images/`.

Facts that decide where the service worker goes:

- Vite serves files in `public/` "at root path `/` during dev, and copied to the root of the dist directory as-is". Their names are not hashed ([Vite: static assets][vite-public]).
- `react-router-serve` serves `build/client` with Express static. Hashed `/assets/*` files are cached for a year (`immutable`, `maxAge: "1y"`), and other client files use default caching (`node_modules/@react-router/serve/dist/cli.js`, lines 115–120). So `public/sw.js` would be served at `/sw.js` in both `npm run dev` and `npm start` with a stable URL. That stable URL is what a service worker needs **(inference)**.
- A service worker's default and maximum scope is the directory of its script. A wider scope needs a `Service-Worker-Allowed` header. The script must be same-origin, `register()` works only in a secure context, and `type: 'module'` is available ([MDN register()][mdn-register]). `/sw.js` gives scope `/`, which covers the whole app.
- React Router does not generate service workers. Under SSR, `navigator.serviceWorker` exists only in the browser, so registration belongs in a `useEffect` or in the click handler of the opt-in button **(inference)**. A plugin such as `vite-plugin-pwa` is optional. Push needs no offline caching, so a small hand-written `public/sw.js` with `push` and `notificationclick` handlers is enough **(inference)**.
- iOS also needs a **web app manifest** whose `display` is `standalone` or `fullscreen`. "Without it, the site saves as a Home Screen bookmark, which opens in the default browser", and push won't work ([WebKit: Web Push for iOS/iPadOS][webkit-ios]; [MDN BCD][bcd]: on iOS "the parent `Notification` interface is undefined unless the page is a web app saved to the home screen. The app's manifest must have a non-default `display` value").

## 3. VAPID keys

- VAPID (RFC 8292) identifies the application server to the push service. The server signs a JWT with **ECDSA P-256 (ES256)**. The token must include `aud` (the push service's origin) and `exp`, which may be **no more than 24 hours** ahead. It SHOULD include `sub`, a `mailto:` or `https:` contact URI. The JWT goes in `Authorization: vapid t=<jwt>, k=<public key>` ([RFC 8292 §2–3][rfc8292]).
- A subscription made with an `applicationServerKey` is bound to that key. Sends signed with another key are rejected as invalid authentication, and RFC 8292 says a 403 "might be used" ([RFC 8292 §4][rfc8292]). Apple returns `403` with reason `VapidPkHashMismatch` ([Apple][apple-webpush]). **Practical consequence: if the VAPID key pair is rotated or lost, every stored subscription stops working, and each user must subscribe again** **(inference from the above)**.
- `web-push` generates the pair once with `webpush.generateVAPIDKeys()` (or the CLI `web-push generate-vapid-keys`). The docs say: "You should create these keys once, store them and use them for all future messages you send." `setVapidDetails(subject, publicKey, privateKey)` needs a real `mailto:` or `https:` subject, not `mailto:user@localhost` ([web-push README][web-push]). Apple rejects a JWT whose subject "isn't a URL or `mailto:`" with `BadJwtToken` ([Apple][apple-webpush]).
- The public key is not secret, because the client needs it to subscribe. The private key is a server secret. Cadence reads only a couple of `process.env` values today (`DISCORD_INVITE_URL` in a route) and has no `.env` handling. Two new environment variables, `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`, plus a contact subject, would be new configuration **(inference)**.

## 4. Sending from Node and what each push service requires

### The `web-push` package

- npm `web-push` is at **4.0.0**, with `engines.node >= 16`. Its dependencies are `jws`, `asn1.js`, `http_ece` and `https-proxy-agent` (npm registry metadata, [registry.npmjs.org/web-push/latest][npm-web-push]). The local Node is v20.19.2.
- `sendNotification(subscription, payload, options)` encrypts the payload ("the subscription must include `p256dh` and `auth` keys") and signs VAPID. It takes `TTL` (the default is four weeks), `urgency` (`very-low | low | normal | high`), `topic`, `contentEncoding` (`aes128gcm` by default), `timeout` and `proxy` ([web-push README][web-push]).
- If the push service rejects a message, the promise rejects with an error carrying `statusCode`, `headers` and `body` ([web-push README][web-push]).
- It needs no Firebase or Apple developer account. "You don't need to join the Apple Developer Program to send web push notifications" ([Apple][apple-webpush]). The Web Push Protocol is the same API for every push service ([web.dev: Web Push Protocol][webdev-protocol]). Because VAPID identifies the sender, Cadence registers with no vendor **(inference)**.

### Protocol rules (RFC 8030) that every push service enforces

- **`TTL` is mandatory.** A push service "MUST return a 400 (Bad Request)" when it is missing ([RFC 8030 §5.2][rfc8030]).
- **`Urgency`** is `very-low`, `low`, `normal` (the default) or `high` ([RFC 8030 §5.3][rfc8030]).
- **`Topic`** holds at most 32 URL- or filename-safe base64 characters. "A push message with a topic replaces any outstanding push message with an identical topic" ([RFC 8030 §5.4][rfc8030]). This could collapse, say, repeated "new reply" pushes while a device is offline **(inference)**.
- `201 Created` means the push service accepted the message. It does **not** mean the message reached the device ([RFC 8030 §5][rfc8030]).
- `429` means too many requests. The service SHOULD send `Retry-After` ([RFC 8030 §8.4][rfc8030]).

### Per-service notes

| Push service | Facts from its owner |
| --- | --- |
| **Apple** (Safari macOS, iOS/iPadOS Home Screen apps) | Allow outbound `https://*.push.apple.com`. TLS with SNI, HTTP/1.1 or HTTP/2, at most 100 unacknowledged pipelined requests. TTL is stored for "30 days or fewer". "Don't refresh your JWT more frequently than once per hour." Payload is limited to 4 KB (`PayloadTooLarge`). `410` = "The device token has expired". `403` = authentication error. **"Safari doesn't support invisible push notifications… If you don't [show them], Safari revokes the push notification permission for your site."** ([Apple][apple-webpush]; [WebKit iOS][webkit-ios]) |
| **Mozilla autopush** (Firefox) | `404` = "The URL specified is invalid and should not be used again". `410` = "no longer valid and should no longer be used". `413` above about 4 KB. TTL is required, from 0 to 2,592,000 s (30 days). `Topic` is supported ([autopush HTTP API][autopush]). The page marks itself obsolete in favour of autopush-rs, so treat the details as indicative. MDN: Firefox puts a quota on push messages that *don't* show a notification. Pushes that do show one are exempt ([MDN Push API][mdn-push]). |
| **Google FCM** (Chrome, and Chromium browsers that use it) | Chrome and Edge require `userVisibleOnly: true` and an `applicationServerKey` ([MDN subscribe][mdn-subscribe]; [BCD][bcd]). Since January 2026, Chrome rate-limits Push API messages for sites that send a lot with little user engagement. The limit is "no fewer than 1,000 messages per minute", and excess requests get 429 ([Chrome: web push rate limits][chrome-ratelimits]). Since October 2025, Chrome automatically revokes notification permission for sites with "very low user engagement and a high volume of notifications". It "does not revoke notifications for any installed web apps" ([Google: auto-revocation][chrome-autorevoke]). |

## 5. Storing subscriptions: one per browser or device per user

- Each subscription is tied to one service worker registration. `subscribe()` creates a new one "if the current service worker does not have an existing subscription" ([MDN subscribe][mdn-subscribe]). So one user has one subscription per browser profile or installed app. A laptop's Chrome, its Firefox and an iPhone Home Screen app would be three rows **(inference)**.
- The server should store at least `endpoint`, `p256dh` and `auth` with the user ([Apple][apple-webpush]; [web-push][web-push]). A shape that fits Cadence's Drizzle/SQLite schema **(inference, not a design decision)**:
  - `push_subscriptions(id, user_id → users.id ON DELETE CASCADE, endpoint TEXT UNIQUE, p256dh TEXT, auth TEXT, user_agent TEXT NULL, created_at, last_success_at NULL)`.
  - A unique `endpoint` handles re-subscribes and a user switching accounts in the same browser. Upsert on `endpoint` and reassign `user_id`.
  - The schema change goes through the repo's `database-migrations` skill: generate the migration, update the seed, reseed.
- `PushSubscription.expirationTime` exists but may be `null`. The `pushsubscriptionchange` event fires "when a push subscription has been invalidated, or is about to be invalidated" ([MDN Push API][mdn-push]). Support for it is uneven. Chrome added it only in **138**. Firefox lacks `oldSubscription`/`newSubscription`. Safari macOS has it. **iOS Safari does not** ([BCD][bcd]). So the server cannot rely on it, and send-time pruning is what keeps the table clean **(inference)**.

### Pruning (404 / 410)

- RFC 8030: a push service "MUST return a 404 (Not Found)" for an expired subscription ([RFC 8030 §7.3][rfc8030]). Push services also return 410 for subscriptions that are gone (Apple: "The device token has expired"; autopush: "should no longer be used").
- Google's guidance: "if we receive one of these [404 or 410], it means the subscription has expired or is no longer valid. In these scenarios, we need to remove the subscriptions from our database" ([web.dev: sending with web-push][webdev-libs]).
- Pruning other errors is unsafe. `400` or `413` is a bug in Cadence. `403` is a VAPID key problem. `429` and `5xx` call for a retry with back-off ([RFC 8030][rfc8030]; [Apple][apple-webpush]).
- Unsubscribing: when a user turns Push off on a device, the client calls `subscription.unsubscribe()` and tells the server to delete the row ([MDN Push API][mdn-push]: `PushSubscription` "allows unsubscribing from a push service"). When a user revokes permission in browser settings, Cadence learns of it at the next send, as 404 or 410 **(inference)**.

## 6. Browser support today

From MDN browser-compat-data (`api.PushManager`, `api.Notification.requestPermission`, `api.ServiceWorkerRegistration.showNotification`, `api.ServiceWorkerGlobalScope.pushsubscriptionchange_event`; [BCD][bcd]). MDN rates the Push API "Baseline: Widely available… since March 2023" ([MDN Push API][mdn-push]).

| Platform | Web Push | Caveats |
| --- | --- | --- |
| Chrome desktop / Android | 42+ | `applicationServerKey` and `userVisibleOnly: true` required. Quiet UI, rate limits and auto-revocation as in §4 and §7. |
| Edge | 17+ | Same rules as Chrome. |
| Firefox desktop | 44+ | `requestPermission()` and `subscribe()` work only from a user gesture since 72. |
| Firefox Android | 48+ | User gesture required since 79. |
| Opera, Samsung Internet | Same as Chromium | |
| **Safari macOS** | **16+ on macOS 13 Ventura or later** | No silent pushes: permission is revoked if no notification is shown. |
| **Safari iOS / iPadOS** | **16.4+, Home Screen web apps only** | Needs a manifest with `display: standalone` or `fullscreen`. Inside a normal Safari tab, `Notification` is undefined. Permission requests must follow a direct tap. No `pushsubscriptionchange`. |
| Android WebView, iOS WKWebView (in-app browsers) | **Not supported** | Links opened inside Slack, Gmail and similar apps can't subscribe. |

Recent Apple additions: **Declarative Web Push** shipped in iOS/iPadOS 18.4 (Home Screen web apps) and macOS Safari 18.5. A push whose JSON payload has `"web_push": 8030`, a `notification.title` and a `navigate` URL is shown by the browser without running service-worker JavaScript. It also adds `window.pushManager`, so a page can subscribe without a service worker. The same payload still works in other browsers through their service worker. WebKit's motive: Intelligent Tracking Prevention "deletes all website data for websites you haven't visited in a while," including service worker registrations, "which would make push subscriptions useless" ([WebKit: Meet Declarative Web Push][webkit-declarative]; [WebKit: Safari 18.4][webkit-184]).

## 7. Permission prompts: rules and timing

- **User gesture is required.** Firefox 72+ (Android 79+) accepts `Notification.requestPermission()` and `PushManager.subscribe()` only from a user gesture such as `click` ([MDN Firefox 72][ff72]; [BCD][bcd]). On iOS, apps can request permission "as long as that request is in response to direct user interaction" ([WebKit iOS][webkit-ios]). Apple: "When the user completes the gesture, call the push subscription method immediately from the gesture's event handler code" ([Apple][apple-webpush]). MDN: "going forward browsers will explicitly disallow notifications not triggered in response to a user gesture" ([MDN subscribe][mdn-subscribe]).
- **Chrome quiet UI.** Chrome 80 introduced a quieter permission UI. "Chrome will automatically enroll sites with very low Accept rates into the quieter UI." Enrollment is per device type, so a site can be quiet on mobile and normal on desktop ([Chrome: notification permission data in CrUX][chrome-crux]). In quiet mode there is no pop-up, only a bell icon in the address bar ([Chrome Help][chrome-help]). Firefox needs no separate quiet mode, because it refuses requests that don't come from a gesture (above).
- **Timing best practice (Google).** "Let your users take the initiative and turn on notifications at their own pace." Put toggles inside existing UI at workflow steps where users want updates. "Avoid showing prompts and/or overlays without context or immediately after a user lands on the site" ([Chrome: CrUX permission data][chrome-crux]).
- **Permission is per origin and per browser.** The denied state is sticky. Once the user picks "Block", the page cannot prompt again, and the user must change it in browser settings **(inference: standard Notifications API behaviour, not quoted from a fetched source)**.

## 8. HTTPS and local testing

- Service workers and the Push API need a **secure context** ([MDN register()][mdn-register]; [MDN subscribe][mdn-subscribe]). `localhost`, `*.localhost`, `127.0.0.0/8` and `::1` count as potentially trustworthy ([MDN: Secure contexts][mdn-secure]). So `npm run dev` on `http://localhost:5173` can register `/sw.js` and subscribe in desktop Chrome and Firefox **(inference)**. Vite serves `public/` in dev ([Vite][vite-public]).
- The browser's real push service is still involved locally: the endpoint is FCM, autopush or Apple. The dev machine needs outbound internet, but no inbound port **(inference from the protocol: the server POSTs out to the endpoint)**.
- Chrome DevTools has a **Push** button under Application → Service workers. It "emulates a push notification without a payload". **Update on reload** forces the service worker to update on each load ([Chrome DevTools: PWA][chrome-devtools]).
- **Phones can't use the localhost exemption.** A phone reaching the dev machine by LAN IP is on plain HTTP, which is not a secure context. iOS also needs the site added to the Home Screen first. iOS testing therefore needs an HTTPS origin: a tunnel or a deployed staging site **(inference)**. The repo has no deployment config today.

## 9. Payload size and encryption

- Encryption is mandatory for payloads. Content-Encoding is exactly `aes128gcm` (RFC 8291 §4), using ECDH on P-256 with the subscription's `p256dh` key and a 16-byte `auth` secret ([RFC 8291 §2–3][rfc8291]). `web-push` does this for you ([web-push][web-push]).
- Size: "A push service is not required to support more than 4096 octets of payload body", which "equates to, at most, 3993 octets of plaintext" ([RFC 8291 §4][rfc8291]). Push services "MUST NOT return a 413" at 4096 bytes or less ([RFC 8030 §7.2][rfc8030]). Apple caps payloads at 4 KB ([Apple][apple-webpush]). Autopush's page mentions 4028 characters, and about 2744 bytes for "bridged" connections ([autopush][autopush]).
- Practical upshot: send a small JSON with a title, a short body and a Cadence URL, and let the click open the full content in Cadence, rather than shipping message bodies **(inference)**. Padding can hide message length ([RFC 8291 §7][rfc8291]).

## 10. Rough effort estimate for this codebase **(inference)**

Assumptions: the Notification model and the In-app Channel exist or are built in the same effort. The trigger and delivery mechanism (#1 "Not yet specified") and per-user Channel preferences come from other tickets. Estimates are for one developer who knows the codebase.

| Work item | Est. |
| --- | --- |
| Web app manifest (`public/manifest.webmanifest`, `display: standalone`, 192 and 512 px PNG icons) plus `<link rel="manifest">` in `app/root.tsx` (needed for iOS) | 0.5 d |
| `public/sw.js`: `push` handler (`showNotification`), `notificationclick` (focus or open the Cadence URL), optional Declarative-Web-Push-compatible payload | 0.5 d |
| VAPID key generation script, `VAPID_*` env vars, contact subject; `web-push` dependency | 0.25 d |
| `push_subscriptions` table, migration, seed update (database-migrations skill) | 0.5 d |
| Resource routes `api/push-subscriptions` (POST upsert, DELETE), auth via `getCurrentUserId`, Zod validation, CSRF consideration (the session cookie is `sameSite: "lax"`) | 0.5 d |
| Opt-in UI in Settings: feature detection, the "Add to Home Screen first" hint on iOS, denied and blocked states, per-device on/off | 1 d |
| Server sender module: fan-out to each of the user's subscriptions, `TTL`/`urgency`/`topic`, prune on 404/410, log other errors | 0.5–1 d |
| Tests (Vitest): subscription storage, sender with `web-push` mocked, pruning | 0.5–1 d |
| Manual cross-browser check: Chrome, Firefox, Safari macOS, iOS Home Screen app over an HTTPS tunnel | 0.5–1 d |
| **Total** | **≈ 4–6 developer-days** |

Not included: HTTPS hosting and production deployment (none exists in the repo); a background job or queue if pushes are sent outside the request (#1 open question); grouping or digests; message wording.

## Sources

All accessed 2026-11-11.

- [mdn-push]: MDN, Push API. https://developer.mozilla.org/en-US/docs/Web/API/Push_API
- [mdn-subscribe]: MDN, PushManager.subscribe(). https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe
- [mdn-register]: MDN, ServiceWorkerContainer.register(). https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/register
- [mdn-secure]: MDN, Secure contexts. https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts
- [ff72]: MDN, Firefox 72 for developers. https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/72
- [bcd]: MDN browser-compat-data, `api/PushManager.json`, `api/Notification.json`, `api/ServiceWorkerRegistration.json`, `api/ServiceWorkerGlobalScope.json`. https://github.com/mdn/browser-compat-data/tree/main/api
- [rfc8030]: IETF RFC 8030, Generic Event Delivery Using HTTP Push. https://www.rfc-editor.org/rfc/rfc8030.html
- [rfc8291]: IETF RFC 8291, Message Encryption for Web Push. https://www.rfc-editor.org/rfc/rfc8291.html
- [rfc8292]: IETF RFC 8292, VAPID for Web Push. https://www.rfc-editor.org/rfc/rfc8292.html
- [apple-webpush]: Apple Developer, Sending web push notifications in web apps and browsers. https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers
- [webkit-ios]: WebKit blog, Web Push for Web Apps on iOS and iPadOS (2023-02-16). https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- [webkit-declarative]: WebKit blog, Meet Declarative Web Push. https://webkit.org/blog/16535/meet-declarative-web-push/
- [webkit-184]: WebKit blog, WebKit Features in Safari 18.4. https://webkit.org/blog/16574/webkit-features-in-safari-18-4/
- [web-push]: web-push-libs/web-push README. https://github.com/web-push-libs/web-push
- [npm-web-push]: npm registry metadata for web-push. https://registry.npmjs.org/web-push/latest
- [webdev-libs]: web.dev, Sending messages with web push libraries. https://web.dev/articles/sending-messages-with-web-push-libraries
- [webdev-protocol]: web.dev, The Web Push Protocol. https://web.dev/articles/push-notifications-web-push-protocol
- [autopush]: Mozilla autopush HTTP endpoints (marked obsolete; see autopush-rs). https://autopush.readthedocs.io/en/latest/http.html
- [chrome-crux]: Chrome for Developers, Adding notification permission data to CrUX. https://developer.chrome.com/blog/notification-permission-data-in-crux
- [chrome-help]: Google Chrome Help, Use notifications to get alerts. https://support.google.com/chrome/answer/3220216
- [chrome-ratelimits]: Chrome for Developers, Increasing web push notification value with rate limits (2026-01-06). https://developer.chrome.com/blog/web-push-rate-limits
- [chrome-autorevoke]: Google blog, Automatic notification permission revocation (2025-10-10). https://blog.google/chromium/automatic-notification-permission/
- [chrome-devtools]: Chrome DevTools, Debug Progressive Web Apps. https://developer.chrome.com/docs/devtools/progressive-web-apps
- [vite-public]: Vite, Static Asset Handling, The public directory. https://vite.dev/guide/assets.html
- Local: `node_modules/@react-router/serve/dist/cli.js` (v8.3.0), lines 115–120; `package.json`; `app/root.tsx`; `app/lib/session.ts`; `app/db/schema.ts`.

[mdn-push]: https://developer.mozilla.org/en-US/docs/Web/API/Push_API
[mdn-subscribe]: https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe
[mdn-register]: https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/register
[mdn-secure]: https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts
[ff72]: https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/72
[bcd]: https://github.com/mdn/browser-compat-data/tree/main/api
[rfc8030]: https://www.rfc-editor.org/rfc/rfc8030.html
[rfc8291]: https://www.rfc-editor.org/rfc/rfc8291.html
[rfc8292]: https://www.rfc-editor.org/rfc/rfc8292.html
[apple-webpush]: https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers
[webkit-ios]: https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
[webkit-declarative]: https://webkit.org/blog/16535/meet-declarative-web-push/
[webkit-184]: https://webkit.org/blog/16574/webkit-features-in-safari-18-4/
[web-push]: https://github.com/web-push-libs/web-push
[npm-web-push]: https://registry.npmjs.org/web-push/latest
[webdev-libs]: https://web.dev/articles/sending-messages-with-web-push-libraries
[webdev-protocol]: https://web.dev/articles/push-notifications-web-push-protocol
[autopush]: https://autopush.readthedocs.io/en/latest/http.html
[chrome-crux]: https://developer.chrome.com/blog/notification-permission-data-in-crux
[chrome-help]: https://support.google.com/chrome/answer/3220216
[chrome-ratelimits]: https://developer.chrome.com/blog/web-push-rate-limits
[chrome-autorevoke]: https://blog.google/chromium/automatic-notification-permission/
[chrome-devtools]: https://developer.chrome.com/docs/devtools/progressive-web-apps
[vite-public]: https://vite.dev/guide/assets.html
