# Deploy SOLAR to Vercel

SOLAR is a static single-page app (no backend, no build step). These two files make this
folder deploy cleanly: `vercel.json` (serve as static + security headers) and `.vercelignore`
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
- The only outbound network call is the Leaflet basemap tile server (with offline fallback).
