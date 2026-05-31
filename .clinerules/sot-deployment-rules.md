# SOT Deployment Rules

## Source Code

- SOT app source code is managed in GitHub.
- Always check Git status before deployment.
- Pull or deploy only from the intended GitHub branch.
- Do not deploy uncommitted or unclear local changes.
- Do not create changes directly on the VPS unless explicitly instructed.
- Any source code change should be committed locally and pushed to GitHub.

## Database

- SOT database is hosted on the VPS.
- Before any database structure/schema update, always create a backup first.
- Database backup must be restorable so changes can be rolled back.
- Do not run migrations, schema changes, table changes, or destructive DB commands without confirming that a backup exists.
- If a DB update fails, stop and report the issue instead of trying random fixes.
- Never overwrite or delete production database data unless explicitly instructed.

## Existing Applications and Services

- Do not bother, stop, overwrite, delete, restart, or modify unrelated existing applications or services on the VPS.
- During deployment, only touch files, processes, services, and database objects that belong to SOT.
- Before restarting anything, confirm the service/process name belongs to SOT.
- Do not modify global VPS config unless explicitly required and confirmed.
- Do not overwrite existing `.env`, Nginx configs, PM2 configs, systemd services, or database data without backup and confirmation.

## Sync Requirement

- If there are any code, config, database, or deployment changes, make sure local, GitHub, and VPS are synchronized.
- Before deployment, check local status with `git status`.
- Make sure local committed changes are pushed to GitHub.
- Make sure the VPS pulls the correct latest commit from GitHub.
- After deployment, verify the VPS is running the same intended commit as GitHub.
- Do not leave changes only on local, only on GitHub, or only on the VPS unless explicitly instructed.
- If there is a mismatch between local, GitHub, and VPS, stop and report the mismatch before continuing.

## Deployment Safety Checklist

Before deployment:

1. Confirm target app is SOT.
2. Confirm GitHub branch.
3. Run `git status`.
4. Confirm local committed changes are pushed to GitHub.
5. Confirm deployment path on VPS.
6. Confirm the service/process belongs to SOT.
7. If database structure will change, backup the VPS database first.
8. Deploy without affecting unrelated apps/services.
9. Pull the intended latest GitHub commit on the VPS.
10. Verify SOT works after deployment.
11. Confirm local, GitHub, and VPS are synchronized.
12. Confirm VPS is running the latest intended GitHub commit.

## Behavior Rules for Cline

- At the beginning of every SOT task, read this file first.
- Follow these rules strictly for all SOT coding, database, and deployment work.
- Ask before any destructive command.
- Stop and report if unsure whether a command affects only SOT.
- Never store or print raw VPS passwords, database passwords, API keys, private keys, tokens, or `.env` values.
- After updating this file, read it back and confirm the rules are saved.
