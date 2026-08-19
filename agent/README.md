# Attendance sync agent

Runs on the ONtime PC. Reads punches straight out of ONtime's own database and
pushes them to the Ftech Office web app.

**Nothing listens on this PC.** The agent only makes outgoing HTTPS calls, so
no port is opened, nothing is exposed to the internet, and the database
password stays in a file on this machine — it is never sent anywhere.

It reads two kinds of database, set by `sql.driver` in the config:

| `driver` | For |
|---|---|
| `access` | ONtime's `.mdb` file — the usual ONtime install. **Start here.** |
| `mssql` | SQL Server Express, e.g. eTimeTrackLite |

---

## Part 1 — Find the ONtime database

Nothing to install and nothing to switch on. The agent reads the `.mdb` through
the same ACE OLE DB provider ONtime itself uses, which is already on that PC.

**1. Find the file.** It normally sits beside the ONtime program, often
`C:\Program Files (x86)\ONtime\ontime_att.mdb`. If you cannot find it, search
the C: drive for `*.mdb` and take the one that grows as people punch in.

**2. Copy the full path.** In Explorer, hold **Shift**, right-click the file →
**Copy as path**. You will paste this into `sql.file`.

**3. Know the password, if there is one.** Many ONtime installs put a password
on the `.mdb`. If yours has one it goes in `sql.password`; if it opens without
one, leave that empty.

> **The agent never writes.** Every statement it runs is a `SELECT`, and the
> connection is opened in read mode. If this PC is ever compromised, the
> attacker still cannot alter the attendance record through the agent.

> **ONtime must still be downloading from the device.** The agent forwards what
> ONtime has already collected — it does not talk to the biometric machine
> itself. If ONtime stops pulling from the device, the agent faithfully sends
> nothing. Check ONtime's own auto-download is running and current.

<details>
<summary>Using SQL Server Express instead (eTimeTrackLite and similar)</summary>

Set `"driver": "mssql"` and fill in the `server` / `port` / `database` / `user`
block. Most of this is switched off by default on Express — do it once:

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

If the agent runs on this same PC you need no firewall rule — it connects to
`localhost`. Only open port 1433 if SQL Server is on a different machine from
the agent, and then only to that machine.

</details>

## Part 2 — Get the office key

The office key is how the web app knows a batch of punches really came from
your office PC and not from someone on the internet who guessed your address.
One key per PC.

**Create it:** sign in as Super Admin → **Attendance sync** → **Add office PC**
→ give it a name you will recognise later, like `Front desk PC`.

**Copy the key it shows.** It looks like `ftk_9f3c…` and **it is shown once and
never again.** The web app keeps only a hash of it, so nobody — not even a
Super Admin — can read it back afterwards. Lose it and you revoke that PC and
add it again.

**Use it:** paste it into `agentKey` in the config file in Part 3. That is the
only place it goes. The agent sends it as a bearer token on every call, over
HTTPS, along with a timestamp the server checks against a five-minute window,
so a captured request cannot be replayed later.

**If it leaks:** **Attendance sync** → revoke that PC. The key stops working
immediately and the already-synced punches are untouched.

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

Open that `config.json` in Notepad and fill in:

- `apiUrl` — your web app's address, e.g. `https://office.yourdomain.com`
- `agentKey` — the office key from Part 2
- `sql.file` — the full path to the `.mdb` from Part 1
- `sql.password` — the database password, or empty if it has none

Leave `driver` as `access` and leave the whole `query` block alone for now.

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

## Pulling in older history — read this before raising `backfillDays`

`sync.backfillDays` decides how many past days the agent **closes**. Closing a
day is what turns it from "not collected yet" into a judged day, and a closed
day with no punch for someone is an **absence that costs them a day's pay**.

That cuts both ways. Set it to 90 to pull in two old months, and every day in
that window with no punches in ONtime is marked absent — **for every active
employee**, not just the one you were thinking about. If ONtime's own history
only goes back three weeks, the rest of that window closes empty and the whole
staff loses two months of salary on paper.

So, to bring in an old month safely:

1. **Check what ONtime actually holds first.** If its punch log starts on the
   7th, there is no point reaching back to the 1st.

       .\office-attendance-sync.ps1 -ShowSchema

2. **Set `backfillDays` to reach that far and no further.**

3. **Forget the sync position** so the agent re-reads from the beginning.
   Re-sending is always safe — the web app rejects a punch it already has.

       .\office-attendance-sync.ps1 -ResetCursor

4. **Run one sync by hand and check the result**, before letting the scheduled
   task loose on it:

       .\office-attendance-sync.ps1 -Once

5. **Look at Attendance for that month in the web app.** If a run of days came
   out absent that should not have, lower `backfillDays`, correct those days,
   or declare them holidays. An admin correction is never overwritten by a
   later sync.

Once the old months are in, put `backfillDays` back to something small like
14. It only needs to cover the longest the office PC is realistically off.

## How it behaves when things go wrong

**The internet drops.** The cursor only moves after the web app confirms it
stored a batch, so the agent re-reads and re-sends the same rows until they
land. Retries back off to at most an hour apart.

**This PC is switched off for days.** The punches wait in ONtime's database.
When the PC comes back the agent works through the backlog and then confirms
each missed day. Until a day is confirmed the web app shows it as **NA** and
deducts nobody's salary for it — a switched-off PC never costs anyone money.
Once a day is confirmed it is judged normally, so somebody who really was
absent on one of those days is marked absent then, and their salary reflects it
from that moment.

**The provider is not registered.** ACE comes in a 32-bit and a 64-bit build,
and a program can only load its own. The agent tries both PowerShells before
giving up. If it still fails, install the
[Access Database Engine redistributable](https://www.microsoft.com/download/details.aspx?id=54920)
matching your Office/ONtime bitness, or set `sql.powershell` to `"32"`.

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
