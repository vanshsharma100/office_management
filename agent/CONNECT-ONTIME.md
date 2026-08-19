# Connecting the web app to ONtime — every step

This is the exact procedure for **this** office, filled in with what has already
been discovered and set up. Follow it top to bottom.

**The chain, so you know what each step is for:**

```
biometric device
      │  (ONtime downloads punches from it — ONtime's own job)
      ▼
ONtime database  (ontime_att.mdb, on the office PC)
      │  (the agent reads new punches)
      ▼
sync agent  (office-attendance-sync.ps1)
      │  (outgoing HTTPS + office key — nothing listens on the PC)
      ▼
your web app  →  punches stored  →  UID mapped to employee  →  attendance & salary
```

---

## What is already done

- **Agent installed** and its settings file created at
  `C:\ProgramData\Ftech\sync-agent\config.json`.
- **Office key created and working** — it is already in that file and the web
  app accepted it (`connected as agent`).
- **Provider set correctly** — ONtime uses `Microsoft.Jet.OLEDB.4.0` (32-bit),
  and the config is set to `provider: Jet 4.0` + `powershell: "32"`. Confirmed
  this loads and reaches the database.
- **Database found** — `C:\Program Files (x86)\ONtime\ACCESSDB\ontime_att.mdb`,
  the live file ONtime writes to.

## The one thing still needed: the database password

The `.mdb` is password-protected. ONtime keeps that password **inside its own
program** — it is not in `ONtime.exe.config`, so it cannot be read out. Until it
is filled in, the agent cannot open the file.

**Get it from your ONtime dealer / installer**, or ONtime support for your
version. Then do Step 1.

---

## Step 1 — Put the password in

Open in Notepad (Start → type `notepad`, then File → Open):

```
C:\ProgramData\Ftech\sync-agent\config.json
```

Find this line and type the password between the quotes:

```json
    "password": "",
```

Save and close.

> If ONtime and the web app are on **different PCs**, also change `apiUrl` in
> the same file from `http://localhost:4001` to the web app PC's address, e.g.
> `http://192.168.1.50:4001`, and open inbound TCP 4001 in Windows Firewall on
> the web app PC. On one PC, leave `apiUrl` as it is.

## Step 2 — Check both ends are reachable

Open **PowerShell** and run:

```powershell
cd C:\Users\pc\Documents\vansh_office\agent
```
```powershell
powershell -ExecutionPolicy Bypass -File .\office-attendance-sync.ps1 -TestConnection
```

You want to see **"Both sides are reachable"** and a line like
`read N punch rows`. If it says *"The database password was rejected"*, the
password in Step 1 is wrong — fix it and run again.

## Step 3 — Read ONtime's real table and column names

The names in the config are guesses. This reads the real ones:

```powershell
powershell -ExecutionPolicy Bypass -File .\office-attendance-sync.ps1 -ShowSchema
```

It prints ONtime's tables and the columns of the one that looks like the punch
log. Open `config.json` again and set `query.columns` to the matching names:

| Config field | What it is |
|---|---|
| `id` | An always-increasing row number (best — never misses a row) |
| `uid` | The user number from the device, e.g. `77` |
| `punchAt` | The punch date and time |
| `direction` | IN/OUT column if there is one, otherwise leave `null` |
| `deviceId` | Which reader, if more than one, otherwise `null` |

*(If you are unsure, paste the `-ShowSchema` output to me and I will set these.)*

## Step 4 — See how far back ONtime's data really goes

**Do this before pulling in old months.** Closing a day with no punches marks
everyone absent for it, so you must not reach further back than ONtime actually
has data.

```powershell
powershell -ExecutionPolicy Bypass -File .\office-attendance-sync.ps1 -DataRange -Days 90
```

It prints the earliest and latest punch and the **highest `backfillDays` that is
safe**. If you only want new data from now on, leave `backfillDays` at 14 and
skip to Step 6.

## Step 5 — (Only to import old months) set the window, then re-read

In `config.json` set `sync.backfillDays` to the safe number from Step 4, then:

```powershell
powershell -ExecutionPolicy Bypass -File .\office-attendance-sync.ps1 -ResetCursor
```

## Step 6 — Do one sync by hand and watch it work

```powershell
powershell -ExecutionPolicy Bypass -File .\office-attendance-sync.ps1 -Once
```

You should see `pushed N punches` and `confirmed <date> collected` lines.

## Step 7 — Match device numbers to employees (once per person)

A punch arrives against a device number (UID), e.g. `77`. Tell the web app who
that is — **once**:

1. Sign in to the web app as Super Admin.
2. **Attendance Sync** → the unmapped UIDs appear there.
3. Map each UID to the right employee.

The moment you map someone, their **past** punches are recalculated too, so
history is not lost. From then on every punch for that UID is theirs, and your
attendance / late / half-day / salary rules run on it automatically.

## Step 8 — Turn on automatic syncing

Open **PowerShell as Administrator**, then:

```powershell
cd C:\Users\pc\Documents\vansh_office\agent
```
```powershell
powershell -ExecutionPolicy Bypass -File .\office-attendance-sync.ps1 -InstallTask
```

This creates a Windows task that:

- starts at boot — **nobody needs to log in**,
- syncs every 15 minutes,
- restarts itself if it fails,
- and, because a switched-off PC keeps the punches waiting in ONtime, **catches
  up automatically** when the PC comes back.

Check on it any time (no admin needed):

```powershell
powershell -ExecutionPolicy Bypass -File .\office-attendance-sync.ps1 -Status
```

---

## After it is running

- **Employee comes in / goes out** → ONtime records the punch → within 15
  minutes the agent sends it → the web app shows check-in / check-out, hours,
  late minutes, and the day's status.
- **PC off for two days** → those days show as *not collected* (nobody is
  docked). When the PC returns and catches up, a real absence on one of those
  days is then marked and salary reflects it. A genuine present day is filled
  in correctly.

## The two things that will silently break it

1. **ONtime must keep downloading from the device.** The agent forwards what
   ONtime has already collected — it does not talk to the device itself. If
   ONtime stops pulling, the agent faithfully sends nothing. Your ONtime data
   was last fresh on **7 Aug** — make sure ONtime's auto-download is running
   before you trust the numbers.
2. **A new employee's UID is unmapped** until you do Step 7 for them. Their
   punches are kept, not lost, and appear in Attendance Sync waiting to be
   mapped.

## Going live later

When you move off localhost to a real server, change only `apiUrl` in
`config.json` to your `https://` address, and create a **fresh office key** for
the server (revoke the test one in Attendance Sync). Nothing else changes.
