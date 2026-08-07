# Attendance sync agent

Runs on the office PC. Reads punches from the biometric software's SQL Server
Express database and pushes them to the Ftech Office web app.

**Nothing listens on this PC.** The agent only makes outgoing HTTPS calls, so
no port is opened, nothing is exposed to the internet, and the SQL Server
password stays in a file on this machine — it is never sent anywhere.

---

## Part 1 — Prepare SQL Server Express

Most of this is switched off by default on Express. Do it once.

**1. Turn on TCP/IP.** Open *SQL Server Configuration Manager* →
**SQL Server Network Configuration** → **Protocols for SQLEXPRESS** → right-click
**TCP/IP** → **Enable**.

**2. Give it a fixed port.** Same screen: double-click **TCP/IP** → **IP Addresses**
tab → scroll to **IPAll** → clear **TCP Dynamic Ports**, set **TCP Port** to `1433`.
Express uses a random port that changes on restart otherwise, and nothing can
reliably connect to it.

**3. Allow password logins.** In SQL Server Management Studio, right-click the
server → **Properties** → **Security** → select **SQL Server and Windows
Authentication mode**.

**4. Restart the service.** Configuration Manager → **SQL Server Services** →
right-click **SQL Server (SQLEXPRESS)** → **Restart**.

**5. Create a read-only login.** In SSMS, run this against your biometric
database — replace the password with a real one:

```sql
CREATE LOGIN ftech_sync WITH PASSWORD = 'put-a-strong-password-here';
USE [eTimeTrackLite1];
CREATE USER ftech_sync FOR LOGIN ftech_sync;
ALTER ROLE db_datareader ADD MEMBER ftech_sync;
```

Read-only is deliberate. If this PC is ever compromised, the attacker still
cannot alter the attendance record.

> If the agent runs on this same PC, you do **not** need any firewall rule —
> it connects to `localhost`. Only open port 1433 if SQL Server is on a
> different machine from the agent, and then only to that machine.

## Part 2 — Register this PC in the web app

Sign in as Super Admin → **Settings → Attendance sync** → **Add office PC**.

Copy the key it shows. **It is shown once and never again** — if you lose it,
revoke it and make a new one.

## Part 3 — Install the agent

Install [Node.js 20 or newer](https://nodejs.org) on the office PC, then:

```bash
cd agent
```

```bash
npm install
```

```bash
npm run init
```

That creates your settings file **outside this folder**, at:

```
C:\ProgramData\Ftech\sync-agent\config.json
```

Deliberately outside. The SQL password and the agent key live in there, and a
`git pull` or a re-clone of this repo must never be able to wipe them or sweep
them into a commit. The agent's cursor (`state.json`) sits beside it for the
same reason — update the code freely, the settings and sync position stay put.

`npm run init` prints an `icacls` command. Run it. It stops every user account
on that PC from reading the SQL password.

Open that `config.json` in Notepad and fill in `apiUrl`, `agentKey`, and the
`sql` block. Leave `query` alone for now.

> Need it somewhere else? Pass `--config D:\somewhere\config.json` to any
> command, or set `FTECH_AGENT_CONFIG`. A `config.json` left inside `agent/`
> from an older install is still picked up, so nothing breaks on upgrade.

**Find the right table.** Every vendor names these differently:

```bash
npm run discover
```

That lists every table, and prints the columns of whatever looks like the punch
log. Put the matching names into `config.json` → `query.columns`:

| Config field | What it is |
|---|---|
| `id` | An always-increasing row id. Best cursor — nothing gets missed. |
| `uid` | The user id from the device, e.g. `104` |
| `punchAt` | The punch date and time |
| `direction` | IN/OUT column, if the device records one. `null` is fine. |
| `deviceId` | Which reader, if there is more than one. `null` is fine. |

If the table has no increasing id column, set `"cursorMode": "time"`.

**Check both ends are reachable:**

```bash
npm run test-connection
```

**Do one sync by hand and watch it work:**

```bash
npm run once
```

## Part 4 — Run it automatically

The agent must start when the PC boots, without anyone logging in — otherwise
a rebooted office PC syncs nothing until someone happens to sign in.

Open **Command Prompt as Administrator** and run this, correcting the path:

```bash
schtasks /Create /TN "Ftech Attendance Sync" /TR "\"C:\Program Files\nodejs\node.exe\" \"C:\ftech\agent\src\index.js\"" /SC ONSTART /RU SYSTEM /RL HIGHEST /F
```

Start it now without rebooting:

```bash
schtasks /Run /TN "Ftech Attendance Sync"
```

Check on it any time:

```bash
schtasks /Query /TN "Ftech Attendance Sync"
```

---

## How it behaves when things go wrong

**The internet drops.** The cursor only moves after the web app confirms it
stored a batch, so the agent re-reads and re-sends the same rows until they
land. Retries back off to at most an hour apart.

**This PC is switched off for days.** The punches wait in SQL Server. When the
PC comes back the agent works through the backlog and then confirms each missed
day. Until a day is confirmed the web app shows it as **NA** and deducts
nobody's salary for it — a switched-off PC never costs anyone money.

**A punch arrives twice.** Every punch carries the vendor's row identity, and
the web app rejects one it already has. Re-sending is always safe, which is why
the agent does it freely.

**A UID belongs to nobody.** It is stored unlinked and appears in
**Settings → Attendance sync** for you to map to an employee. Mapping it
backfills their history — nothing is lost while a new joiner is unmapped.

## Files

Both live in `C:\ProgramData\Ftech\sync-agent\`, outside this repo, so updating
the code never touches them.

| File | |
|---|---|
| `config.json` | Your settings and secrets. Never commit it, never email it. |
| `state.json` | How far the sync got. Delete it to re-read from the start. |

Back up `config.json` somewhere safe. The agent key inside it cannot be shown
again — if you lose it you must revoke that PC in the web app and register it
afresh.
