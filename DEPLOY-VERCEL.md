# Deploy SOLAR to Vercel

SOLAR is a static single-page app with no frontend build step. The hosted **Add from URL**
feature is implemented by the serverless function at `api/fetch.js`; the rest of the product
is served as static files. These two files make this folder deploy cleanly:
`vercel.json` (routing + security headers) and `.vercelignore`
(keeps node_modules, the SEA blob, .exe builds, tests and dev-notes out of the upload).

## Fastest route — Vercel CLI (one-time login)
From inside this `Solar` folder, in a terminal:

    npx vercel            # first run: logs you in, then creates a PREVIEW deployment
    npx vercel --prod     # promotes it to your public production URL

- First `npx vercel` will ask you to log in (browser/email) and a few setup questions
  — accept the defaults; when it asks the directory to deploy, it's "." (this folder).
- It prints the live URL when done.

## Alternative — Git integration
1. Push this folder to a GitHub/GitLab repo.
2. vercel.com -> Add New -> Project -> import the repo -> Deploy.
3. Every push to the default branch redeploys automatically.

## Notes
- Entry point is `hero.html` (the cinematic cover): `vercel.json` redirects `/` -> `/hero.html`,
  matching the LAN server and the `.exe`. ENTER on the cover leads into the workbench `index.html`.
  (Redirects are processed before the filesystem, so this overrides Vercel's default `/` -> index.html.)
- It's a PUBLIC URL: anyone with the link can open the tool and fetch bundled files
  (`demo_contacts.csv`, `assets/profile_*.docx`). Analyst case data stays in the browser and is
  never uploaded, but the bundle itself is public. To lock the URL later, enable Deployment
  Protection (Password/SSO) in Vercel project settings — requires a Pro plan.
- Online surfaces are the Leaflet basemap (with offline fallback), the analyst-triggered
  `api/fetch.js` URL importer, and explicit external-check links. Core extraction does not
  send case data to a service.
