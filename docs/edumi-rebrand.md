# Edumi rebrand and coding action plan: hand-over

Branch `feature/edumi-rebrand` (Nov 2026). Brand: **Edumi**, `edumi.app`, "Education, made intelligent."
Owner decisions (5 Nov 2026): Edumi is the umbrella. The family service is **Edumi Study Hall**
and the tutor product is **Edumi for Tutors**. Light-first palette, with a dark mode that follows
the device. Product events are stored in Supabase (no third-party analytics).

## What changed

### Brand system

- **`src/lib/brand.ts`**: the name, wordmark, domain, tagline, description, product names and brand
  colours, all in one place.
- **`src/components/wordmark.tsx`**: the `edumi.` wordmark (lowercase Manrope, lavender full stop),
  used in every header: landing, login, onboarding, legal pages, family and staff app, tutor app,
  tutor landing.
- **`src/app/icon.svg`** (favicon) and **`src/app/manifest.ts`**. The old `favicon.ico` is removed.
- **Tokens** (`globals.css`, `ui.css`): the existing token names now carry the Edumi palette, so
  every component changed at once.
  - Light: cloud white page, white cards, charcoal text, slate secondary text, `#E6E8F0` borders.
  - Primary buttons are deep indigo (`--coral` is now indigo). Highlights and focus use lavender
    (`--brand`, `--lavender`).
  - Errors are red (`--pen`). Success is green, warning amber.
  - Dark: midnight indigo surfaces with lavender actions.
  - New Tailwind colours: `brand`, `brand-soft`, `midnight`, `indigo`, `lavender`,
    `lavender-soft`, `success`, `warning`, `error`.
- **Fonts**: Manrope for headings and display numbers (the old `font-serif` class) and Inter for
  the interface, self-hosted by `next/font`. Newsreader is removed.
- **Landing page**:
  - A midnight "Edumi band" with the tagline and links to both products.
  - The hero kicker now names Edumi Study Hall. The family hero copy is kept, because that page
    sells the family service.
  - The paper grain and the italic serif are gone, and pen strokes are now lavender.

### Copy, emails and metadata

- **Copy**: every user-facing "Study Hall" is now "Edumi" (company voice) or "Edumi Study Hall"
  (the family product), in English and Simplified Chinese. "Study Hall for Tutors" is now
  "Edumi for Tutors".
- **Metadata**: page titles "%s · Edumi", Open Graph and Twitter metadata, and `metadataBase`.
- **Emails**: login and confirmation subjects and templates (`npm run emails` regenerated
  `supabase/templates/*`), the bilingual email header wordmark and colours, and tutor
  report/invoice footers.
- **Legal**: house rules `2026-11-v2` and privacy notice `2026-11-draft-9` ("Edumi (formerly
  Study Hall)"). These need publishing (below).
- **Stripe setup script**: product names "Edumi Study Hall: <plan>" and "Edumi for Tutors: Solo",
  plus portal headlines.

### Coding action plan (P0 work done here)

- **Events**:
  - `product_events` table (migration applied).
  - `track()` in `src/lib/events.ts`, which keeps only allow-listed properties, dedupes, flags test
    accounts and never throws.
  - Instrumented actions are listed in `docs/events.md`.
- **Admin analytics** (`/admin/analytics`):
  - Five tabs: Overview, Study Hall, Edumi for Tutors, Operations, Accounts.
  - Date filters (7, 30, 90 days, custom), the data period and last-updated time, and a glossary of
    definitions.
  - Funnels show conversion from the previous stage.
  - "Not tracked" is kept distinct from zero.
  - Test accounts and admins' own tutor workspaces are excluded.
  - Accounts CSV export at `/api/admin/accounts`.
  - The calculations are in `src/lib/analytics.ts` and unit-tested.
- **Tutor workflow and privacy**:
  - A short notice before recording (audio deleted after transcription, transcript kept).
  - A "check before you send" note on every AI draft.
  - "Report a problem or send feedback" links in both apps.
- **Demo video**:
  - A real 40-second run (real AI, fictional data, demo account deleted afterwards), recorded by
    `tests/e2e/demo-recording.spec.ts`.
  - Re-record with:
    `RECORD_DEMO=1 E2E_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/demo-recording.spec.ts`.
  - It isn't published. See the steps below.

## Kept on purpose (not renamed)

- **Calendar feed event IDs** (`UID:lesson-…@studyhall` in `src/lib/tutor/ics.ts`): changing them
  would duplicate every lesson in tutors' subscribed calendars.
- **Internal identifiers**: test email domains (`@studyhall.test`), Stripe metadata
  `app: "study-hall"` (the code looks portal configurations up by it), the repository and Vercel
  project names, and cookie names.
- **History**: database migrations, past docs, and data already in the database, such as old
  legal versions and consents parents gave to them.

## Manual steps (owner)

1. **Merge, then publish the legal documents**:
   ```
   npm run legal:publish
   ```
   New sign-ups then consent to the Edumi versions; existing consents stay as they are.
2. **Supabase**: Authentication → Email Templates. Paste `supabase/templates/confirmation.html`
   into "Confirm signup" and `magic_link.html` into "Magic Link", with the subjects in
   `supabase/config.toml`.
3. **Domain `edumi.app`**:
   - Buy it or point it at Vercel, add it to the Vercel project, and set
     `NEXT_PUBLIC_SITE_URL=https://edumi.app` (Production).
   - In Supabase, set Authentication → URL configuration: Site URL and redirect URLs.
   - Re-run the Stripe webhook setup for the new URL, or edit the endpoint in the Stripe dashboard.
4. **Live Stripe rename** (Claude can't reach the Study Hall live account). Run this in your own
   terminal:
   ```
   STRIPE_SECRET_KEY=sk_live_… npm run stripe:setup -- --live
   ```
   It renames the products and portal headlines. It doesn't touch prices or customers.
   Also change Settings → Business → Public business name and branding (icon, colours) to Edumi.
5. **Email sending (later)**: when you verify a sending domain, use
   `REPORTS_FROM_EMAIL="Edumi <reports@edumi.app>"`.
6. **Demo video**:
   - Watch `~/Desktop/General/edumi-demo/edumi-for-tutors-demo.webm`.
   - Trim and caption it (60–120 s), add an opening line and a closing call to action, then host it.
   - Only then replace "Demo video coming soon" on `/tutors`.
   - It's silent and uncut: a raw recording.

## Not done (needs product decisions or data that doesn't exist yet)

- **Study Hall enquiry and trial-booking funnel**: no enquiry form or trial booking exists, so these
  show as "Not tracked".
- **Support request tracking**: support is by email.
- **Demo-video and CTA analytics**: nothing is published yet.
- **"Report edited before sending" rate**: needs a draft-versus-final comparison.
- **Monthly earnings and growth charts**: the brief's "later" items.
