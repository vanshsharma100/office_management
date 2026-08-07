# Deploying to Hostinger

Written to be followed start to finish without knowing Docker or Linux. Every
command is copy-paste. Total time: about 30 minutes, most of it waiting.

---

## What you are deploying

One container running everything: the API, the database, and the website. A
second container (Caddy) sits in front and handles HTTPS. That is the whole
architecture — there is nothing else to set up.

## What you need first

**A Hostinger VPS.** Not shared hosting, not Premium, not Business — those run
PHP only and cannot run this app. On hostinger.com pick **VPS Hosting → KVM 1**
(the cheapest one is enough for an office of this size).

**A domain or subdomain** pointing at the VPS. If your domain is already with
Hostinger, this is two clicks in the DNS panel.

---

## Step 1 — Create the VPS

1. Buy a **KVM 1** VPS plan.
2. When it asks for an operating system, open the **Application** tab and choose
   **Ubuntu 24.04 with Docker**. This matters — it installs Docker for you.
3. Set a root password when prompted and save it somewhere safe.
4. When setup finishes, copy the **IP address** shown in the VPS panel. It looks
   like `31.220.xx.xx`.

## Step 2 — Point your domain at it

In Hostinger's **Domains → DNS Zone** for your domain, add a record:

| Type | Name | Points to | TTL |
|---|---|---|---|
| `A` | `office` | your VPS IP | 3600 |

That gives you `office.yourdomain.com`. To use the bare domain instead, set Name
to `@`.

DNS takes 5–30 minutes to spread. **Do not continue until it resolves** — Caddy
cannot get an HTTPS certificate before then. Check it from your own PC:

```bash
nslookup office.yourdomain.com
```

When it answers with your VPS IP, carry on.

## Step 3 — Connect to the VPS

In the Hostinger VPS panel click **Browser terminal**, or from your own machine:

```bash
ssh root@YOUR_VPS_IP
```

Everything from here runs on the VPS.

## Step 4 — Get the code

```bash
git clone https://github.com/vanshsharma100/office_management.git
```

```bash
cd office_management
```

> If the repository is private, GitHub will ask for a password and reject your
> normal one. Either make the repository public, or create a token at
> **GitHub → Settings → Developer settings → Personal access tokens → Fine-grained**
> with read access to this repo, and paste the token when it asks for a password.

## Step 5 — Create the settings file

Generate a secret key and copy the output:

```bash
openssl rand -hex 32
```

Create your settings file from the template:

```bash
cp .env.production.example .env
```

Open it:

```bash
nano .env
```

Fill in all six blanks: `DOMAIN`, `JWT_SECRET` (paste what `openssl` printed),
`CORS_ORIGIN`, `SUPER_ADMIN_PASSWORD`, `BACKUP_ADMIN_PASSWORD`, and leave
`SEED_DEMO_DATA=false`.

Save with `Ctrl+O`, `Enter`, then exit with `Ctrl+X`.

**These passwords create your login accounts on first start.** Choose real ones
— the defaults in the repository are public.

## Step 6 — Start it

```bash
docker compose up -d --build
```

The first build takes 3–5 minutes. Then check it is alive:

```bash
curl -fsS http://localhost:4000/api/health
```

You should see `{"ok":true,...}`. If you do, open
**https://office.yourdomain.com** in a browser and sign in with the Super Admin
username and password you set in Step 5.

That is the deployment. Everything below is for keeping it running.

---

## Updating after you push to GitHub

On your PC, push as normal. Then on the VPS:

```bash
cd office_management && ./scripts/deploy.sh
```

It pulls, rebuilds, restarts, and waits until the app answers. Your data lives
in a Docker volume, not in the image, so rebuilding never touches records.

## Backups

Your entire database is one file inside a Docker volume. Back it up:

```bash
./scripts/backup.sh
```

Copies go to `backups/`. To run it automatically every night at 3am:

```bash
crontab -e
```

Add this line at the bottom:

```
0 3 * * * cd /root/office_management && ./scripts/backup.sh >> backups/backup.log 2>&1
```

It keeps the last 30 copies and deletes older ones. Download a copy to your own
machine now and then — a backup that only exists on the same server is not a
backup. From your PC:

```bash
scp root@YOUR_VPS_IP:/root/office_management/backups/*.db ./
```

## Everyday commands

Run these from `~/office_management` on the VPS.

| What you want | Command |
|---|---|
| See if it is running | `docker compose ps` |
| Read the app's logs | `docker compose logs -f app` |
| Read Caddy's logs (HTTPS problems) | `docker compose logs -f caddy` |
| Restart | `docker compose restart` |
| Stop | `docker compose down` |
| Start again | `docker compose up -d` |

---

## When something is wrong

**`docker compose up` says "set JWT_SECRET in .env"** — Step 5 was skipped or
the value was left blank. Open `.env` and fill it in.

**The site shows "connection refused" or does not load** — check DNS actually
resolves to your VPS (`nslookup office.yourdomain.com`), and that ports 80 and
443 are open in the Hostinger VPS firewall panel.

**The browser warns about the certificate** — Caddy could not reach Let's
Encrypt. Almost always DNS was not pointing at the VPS yet when it started.
Fix the DNS, wait for it to resolve, then `docker compose restart caddy`.

**Login says the password is wrong** — the accounts are created only on the very
first start, from the `.env` values at that moment. If you started it once with
blank or wrong passwords, the accounts already exist with those. Sign in and
change the password in the app, or wipe and start over with:

```bash
docker compose down -v && docker compose up -d --build
```

`-v` deletes the data volume. That erases every record. Only use it before the
system holds anything real.

**Login works but immediately logs you out** — you are on `http://`, not
`https://`. The auth cookie requires HTTPS in production. Use the https address.
