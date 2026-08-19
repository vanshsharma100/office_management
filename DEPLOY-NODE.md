# Deploying without a VPS — Node.js hosting + managed Postgres

`DEPLOY.md` covers the VPS route, where Docker runs the app and its database
together on one machine. This file covers the other route: a **Node.js app
host** (Hostinger's Node hosting, Render, Railway) with the database somewhere
else.

Use this one when you do not want to run a server. Use `DEPLOY.md` when you do
— it is fewer moving parts and the data stays on your own machine.

```
Node.js host        runs the API, and serves the built frontend from the
                    same process and the same port
        │
        ▼
managed Postgres    Supabase or Neon, free tier
```

## What the host has to be able to do

Check these three before starting. If any is missing, this route will not work
and the VPS route is the answer.

1. **Node 20 or newer.**
2. **A build step**, or at least a start command you can set. The frontend has
   to be built before the API can serve it.
3. **Environment variables** you can set yourself.

A host that only runs `npm install` and starts a fixed file, with no way to set
variables, cannot run this.

---

## Step 1 — Create the database

Sign up at [supabase.com](https://supabase.com) or [neon.tech](https://neon.tech)
and create a project. Both have a free tier that is ample for an office.

Copy the **connection string** — the URI form, starting `postgresql://`. In
Supabase it is under **Settings → Database → Connection string → URI**.

Treat it as a password, because it contains one.

## Step 2 — Create the tables, from your own PC

Nothing on the host needs a shell for this. From a clone of this repo, with
Node installed:

```bash
DATABASE_URL="postgresql://..." npm run db:push -w server
```

That creates every table. Then the accounts:

```bash
DATABASE_URL="postgresql://..." SUPER_ADMIN_PASSWORD="..." BACKUP_ADMIN_PASSWORD="..." SEED_DEMO_DATA=false npm run db:seed -w server
```

Those two passwords are written into the database **now, and only now**.
Changing the variable later does nothing — the seed leaves an existing account
alone on purpose, so a redeploy can never reset your password behind your back.
After go-live, change it inside the app.

## Step 3 — Point the host at this repository

Create a Node.js application on the host and give it this repository.

| Setting | Value |
|---|---|
| Node version | 20 or newer |
| Install command | `npm install` |
| Build command | `npm run build` |
| Start command | `npm start` |
| Entry point (if it asks instead of a start command) | `server/src/index.js` |

`npm run build` builds the frontend into `web/dist`. `npm start` runs the API,
which serves that folder itself — one process, one port, no second web server
to configure.

**The install must include devDependencies.** Vite is a devDependency, so a
host that runs `npm install --production` cannot build the frontend. If yours
does and cannot be changed, build locally and commit `web/dist` instead.

## Step 4 — Set the environment variables

| Variable | Value |
|---|---|
| `DATABASE_URL` | the connection string from Step 1 |
| `JWT_SECRET` | a long random string — `openssl rand -hex 32` |
| `NODE_ENV` | `production` |
| `CORS_ORIGIN` | the address staff will open, e.g. `https://office.example.com` |
| `SEED_DEMO_DATA` | `false` |

> **Do not set `API_PORT`.** The app reads `API_PORT || PORT || 4000`, and the
> host injects `PORT`. Setting `API_PORT` overrides it, the app listens on the
> wrong socket, and the host reports the deployment as unreachable with nothing
> obviously wrong in the log.

`SUPER_ADMIN_PASSWORD` and `BACKUP_ADMIN_PASSWORD` are not needed here — they
did their work in Step 2.

## Step 5 — Deploy, then check

Visit the host's URL. You should get the sign-in page. Then check the API is
talking to the database:

```
https://your-app-url/api/health
```

`{"ok":true,...,"db":"up"}` means both halves are working. If it says
`"db":"down"`, the app is running but `DATABASE_URL` is wrong or the database
is not reachable from the host.

Sign in with the Super Admin username and the password from Step 2.

---

## What you give up compared with the VPS route

- **Backups are yours to arrange.** `scripts/backup.sh` expects the Postgres
  container from `docker-compose.yml` and will not work here. Supabase and Neon
  take their own backups on paid tiers; on a free tier, run `pg_dump` against
  the connection string on a schedule from a machine you control.
- **Free databases sleep.** Supabase pauses a project after about a week with
  no connections. Daily office use never triggers it; a long holiday might, and
  the first request afterwards is slow while it wakes.
- **Your records live with a third party**, not on a machine you rent.
- **The attendance agent still needs the office PC.** That does not change —
  it reads ONtime's database locally and pushes out over HTTPS. Point `apiUrl`
  in its config at the host's address.
