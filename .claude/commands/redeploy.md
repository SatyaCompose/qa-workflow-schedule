---
description: Pre-deploy checklist — verifies env vars on Vercel match local, GitHub secrets exist, and the right code is on the default branch
---

Walk through these in order and report status:

1. **Local code clean?** Run `git status` and `git diff --stat`. List files that would be pushed.

2. **Env vars on Vercel match local?** Don't access Vercel directly — instead, list the env vars defined in local `.env` (key names only, not values). Tell the user to verify each one is set in `vercel.com → project → Settings → Environment Variables` (Production).

   Expected keys for this project:
   ```
   ASANA_TOKEN
   ASANA_WORKSPACE_GID
   ASANA_SOURCE_USER_GIDS
   ASANA_SPRINTS
   TARGET_USERS
   SUPABASE_URL
   SUPABASE_SERVICE_ROLE_KEY
   CRON_SECRET
   ADMIN_PASSWORD
   ```
   Old / removed names to delete from Vercel: `ASANA_PROJECT_GID`, `ASANA_SPRINT_GIDS`, `ASANA_TARGET_USER_GIDS`, `ASANA_SPRINT_PROJECT_GIDS`.

3. **GitHub Actions secrets?** Remind the user to verify at `github.com/<owner>/<repo>/settings/secrets/actions`:
   - `DEPLOY_URL` (Vercel URL, no trailing slash)
   - `CRON_SECRET` (same value as in Vercel)

4. **Build check.** Optionally run `npx next build` and report success/failure. Stops here if build fails.

5. **Push?** Ask the user whether to commit & push. **Never commit without explicit approval** — see [[feedback-no-auto-commit]] memory.

6. After push, suggest manually firing the workflow from GitHub Actions tab to validate, then visiting the production URL.
