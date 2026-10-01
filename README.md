# Zone01 GraphQL Profile

A profile page for Zone01 Athens students. You sign in with your platform account, and the page
loads your data from the platform GraphQL API and draws statistics as hand-made SVG charts.

Plain HTML, CSS and JavaScript modules. No build step and no dependencies.

## Run locally

ES modules do not load from `file://`, so serve the folder:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Hosting

The site is static, so any static host works. Publish the repository root (`index.html`, `css/`,
`js/`).

- **GitHub Pages:** push the repository to GitHub, then go to Settings → Pages → Deploy from a
  branch → `main` / root.
- **Netlify:** drag the project folder onto <https://app.netlify.com/drop>, or connect the
  repository with no build command and publish directory `.`.

The platform domain is set in `js/config.js`.

## Features

- **Login** with `username:password` or `email:password` (Basic auth to `/api/auth/signin`).
  Invalid credentials show "Invalid username/email or password." The JWT is kept in
  `localStorage` and is dropped when it expires.
- **Logout** button in the top bar. It removes the token, and other open tabs log out too.
- **Three main sections:** Identity, XP and level, Audits.
- **Extra sections:** recent projects (pass/fail) and recent audits you did.
- **Statistics (SVG):**
  1. XP over time (cumulative area chart with hover and keyboard tooltip)
  2. XP by project (top 12 bars)
  3. Skills (radar chart)
  4. Audit ratio (done compared with received)
  5. Project results (pass/fail donut)

  Every chart has a hover tooltip, and the data-heavy ones have a "Show data table" view.
- **GraphiQL page** (`#graphiql`): query and variables editors, example queries, Ctrl+Enter to
  run, and a schema browser built from an introspection query.
- **UI:** light and dark theme (follows the system, with a toggle), responsive down to phone
  width, keyboard focus styles, skip link, ARIA labels, loading and error states, reduced motion.

## Which event is shown

XP, level and projects are filtered to one event (cohort module). The page picks the event of
your highest non-piscine `level` transaction, which is the main curriculum (div-01). To show a
different event, add `?event=<id>` to the URL.

## Queries (audit: normal, nested, arguments)

All queries are in `js/api.js`.

| Query | Type | Used for |
| --- | --- | --- |
| `USER_QUERY` | normal (no arguments) | Identity section, audit ratio, done/received |
| `LEVEL_QUERY` | arguments (`where`, `order_by`) | Current level and event id |
| `XP_QUERY` | arguments + nested (`object { name type }`) | Total XP, XP over time, XP by project |
| `PROGRESS_QUERY` | arguments + nested (`object { name }`, filter on `object.type`) | Projects passed, recent projects, pass/fail donut |
| `SKILLS_QUERY` | arguments (`_like: "skill_%"`) | Skills radar |
| `AUDITS_QUERY` | arguments + nested (`group { path captainLogin }`) | Audits done, recent audits |

The GraphiQL page also has the subject's examples: `object` by id with a variable, and `result`
with nested `user`.

## Checking the data in the platform GraphiQL

Sign in at `https://platform.zone01.gr/graphiql/` and run:

```graphql
# Identity and audits: compare with the Identity and Audits cards
{ user { id login email auditRatio totalUp totalDown } }

# Level and event id
{ transaction(where: { type: { _eq: "level" } }, order_by: { amount: desc }) { amount eventId path } }

# Total XP: add up `amount` and compare with "Total XP" (shown in kB/MB, base 1000)
query ($eventId: Int!) {
  transaction(where: { type: { _eq: "xp" }, eventId: { _eq: $eventId } }) { amount path }
}
```

## Files

```text
index.html         login, profile, statistics and GraphiQL views
css/style.css      theme tokens (light/dark), layout, charts
js/config.js       platform URLs
js/auth.js         sign-in, token storage, JWT decoding, logout
js/api.js          GraphQL request helper and all queries
js/app.js          routing, data loading, profile rendering
js/charts.js       SVG charts (line, bars, donut, radar)
js/graphiql.js     built-in GraphiQL page
js/format.js       number and date formatting
```
