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

## Saved profile (snapshot)

The page only works while your platform account can sign in. To keep it working afterwards:

1. Sign in and click **Download data** (top right of the profile). Keep **Remove private
   details** ticked for a file you will publish. It removes your email and other students'
   logins. Untick it for a full private backup.
2. Rename the file to `snapshot.json`, put it in a `data/` folder in the repository, and commit
   and push it.
3. From then on, visitors who are not signed in see the saved profile, marked **Saved <date>** in
   the top bar. **Sign in** still opens the login page for live data.

You can also view any snapshot file without publishing it: on the login page, click **Open a
snapshot file**. The file is read in the browser and is not uploaded anywhere.

## Remember me

Ticking **Remember me on this device** at sign-in keeps your username or email in
`localStorage`, so it is filled in next time. The password is never stored by the page. It is
handed to the browser's password manager (directly in Chrome and Edge, and through the browser's
own "save password" prompt elsewhere), which keeps it encrypted and fills it in again. Unticking
the box at the next sign-in forgets the username.

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
js/snapshot.js     saving, loading and checking profile snapshots
data/snapshot.json published snapshot (optional, add it yourself)
js/format.js       number and date formatting
```
