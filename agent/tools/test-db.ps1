<#
  A stand-in for ONtime's database, so the rest of the chain can be tested
  today.

  ONtime's own .mdb is password-protected and the password has to come from the
  dealer. Everything downstream of that file — the agent, the office key, the
  HTTP push, UID mapping, attendance, salary — does not care whose .mdb it is.
  So this makes one of our own, in the same shape, with no password, and lets
  you type punches into it by hand.

      you type a punch here -> ontime_test.mdb -> office-attendance-sync.ps1
                                                          |
                                                          v
                                                web app on localhost

  The real code path is used throughout: the same Jet provider, the same
  access-query.ps1 reader, the same agent. When the real password arrives, only
  sql.file and sql.password change, and nothing here needs revisiting.

  Everything lives in its own folder:
      C:\ProgramData\Ftech\sync-agent-test\
  which keeps its own cursor, so testing can never disturb the real agent's
  idea of how far it has got.

  Examples:
      .\test-db.ps1 -Init
      .\test-db.ps1 -Day -Uid 77                     # a full yesterday for UID 77
      .\test-db.ps1 -Day -Uid 77 -In 10:40 -Out 18:00
      .\test-db.ps1 -Add -Uid 77 -At "2026-08-18 09:12"
      .\test-db.ps1 -List
      .\test-db.ps1 -Sync                            # push it to the web app
      .\test-db.ps1 -Clear
#>
[CmdletBinding()]
param(
  [switch]$Init,
  [switch]$Add,
  [switch]$Day,
  [switch]$List,
  [switch]$Clear,
  [switch]$Reset,
  [switch]$Sync,
  [string]$Uid,
  [string]$At,
  [string]$Date,
  [string]$In = '09:12',
  [string]$Out = '18:05',
  [ValidateSet('IN', 'OUT')][string]$Direction,
  [string]$Device = 'TESTDEV',
  [int]$Top = 20
)

$ErrorActionPreference = 'Stop'

# Jet 4.0 is 32-bit only. Rather than make anyone remember that, hop into the
# 32-bit shell ourselves and carry the same arguments across.
if ([Environment]::Is64BitProcess) {
  $ps32 = Join-Path $env:SystemRoot 'SysWOW64\WindowsPowerShell\v1.0\powershell.exe'
  if (Test-Path $ps32) {
    $fwd = New-Object System.Collections.Generic.List[string]
    foreach ($kv in $PSBoundParameters.GetEnumerator()) {
      if ($kv.Value -is [switch]) {
        if ($kv.Value.IsPresent) { $fwd.Add("-$($kv.Key)") }
      } else {
        $fwd.Add("-$($kv.Key)")
        $fwd.Add([string]$kv.Value)
      }
    }
    $forward = $fwd.ToArray()
    & $ps32 -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath @forward
    exit $LASTEXITCODE
  }
}

$TestDir   = Join-Path $env:ProgramData 'Ftech\sync-agent-test'
$Mdb       = Join-Path $TestDir 'ontime_test.mdb'
$CfgPath   = Join-Path $TestDir 'config.json'
$StatePath = Join-Path $TestDir 'state.json'
$RealCfg   = Join-Path $env:ProgramData 'Ftech\sync-agent\config.json'
$AgentPs1  = Join-Path (Split-Path -Parent $PSScriptRoot) 'office-attendance-sync.ps1'
$ConnStr   = "Provider=Microsoft.Jet.OLEDB.4.0;Data Source=$Mdb;"

function Say([string]$text, [string]$colour = 'Gray') {
  Write-Host $text -ForegroundColor $colour
}

function Open-Db {
  $conn = New-Object -ComObject ADODB.Connection
  $conn.Open($ConnStr)
  return $conn
}

function Invoke-Db([string]$sql) {
  $conn = Open-Db
  try { $conn.Execute($sql) | Out-Null } finally { $conn.Close() }
}

# Access has no ISO date literal; #...# is how Jet takes one unambiguously.
function Get-JetDate([datetime]$d) {
  '#' + $d.ToString('yyyy-MM-dd HH:mm:ss') + '#'
}

function Get-When([string]$text) {
  $formats = @('yyyy-MM-dd HH:mm:ss', 'yyyy-MM-dd HH:mm', 'yyyy-MM-ddTHH:mm:ss', 'yyyy-MM-ddTHH:mm')
  $parsed = [datetime]::MinValue
  foreach ($f in $formats) {
    if ([datetime]::TryParseExact($text, $f, [Globalization.CultureInfo]::InvariantCulture,
                                  [Globalization.DateTimeStyles]::None, [ref]$parsed)) {
      return $parsed
    }
  }
  # Fall back to whatever this machine's locale understands, so a hurried
  # "18/08/2026 9:12" still works.
  return [datetime]::Parse($text)
}

function Get-Uid([string]$value) {
  if (-not $value) { throw 'Give a device number, e.g. -Uid 77' }
  if ($value -notmatch '^[A-Za-z0-9_-]{1,64}$') {
    throw "-Uid '$value' must be letters, digits, _ or - only"
  }
  return $value
}

function New-TestDb {
  New-Item -ItemType Directory -Force -Path $TestDir | Out-Null

  if (-not (Test-Path $Mdb)) {
    $cat = New-Object -ComObject ADOX.Catalog
    $cat.Create($ConnStr) | Out-Null
    [Runtime.InteropServices.Marshal]::ReleaseComObject($cat) | Out-Null
    Say "  created $Mdb" 'Green'
  }

  # Deliberately shaped like a biometric punch log: an ever-increasing row id
  # (which is what lets the agent never miss or repeat a punch), the device's
  # own user number, and the moment of the punch.
  $conn = Open-Db
  try {
    $existing = @()
    $schema = $conn.OpenSchema(20)   # adSchemaTables
    while (-not $schema.EOF) {
      if ($schema.Fields.Item('TABLE_TYPE').Value -eq 'TABLE') {
        $existing += [string]$schema.Fields.Item('TABLE_NAME').Value
      }
      $schema.MoveNext()
    }
    $schema.Close()

    if ($existing -notcontains 'DeviceLogs') {
      $sql = 'CREATE TABLE DeviceLogs (' +
             'DeviceLogId COUNTER PRIMARY KEY, ' +
             'UserId TEXT(64), ' +
             'LogDate DATETIME, ' +
             'Direction TEXT(8), ' +
             'DeviceId TEXT(64))'
      $conn.Execute($sql) | Out-Null
      Say '  created table DeviceLogs' 'Green'
    }
  } finally { $conn.Close() }
}

function New-TestConfig {
  if (Test-Path $CfgPath) { Say "  settings already at $CfgPath"; return }
  if (-not (Test-Path $RealCfg)) {
    throw "No config at $RealCfg to copy the office key from. Run the agent's -Init first."
  }

  $cfg = Get-Content $RealCfg -Raw | ConvertFrom-Json

  # Same web app, same office key — only the database underneath changes.
  $cfg.sql.driver     = 'access'
  $cfg.sql.file       = $Mdb
  $cfg.sql.password   = ''
  $cfg.sql.provider   = 'Microsoft.Jet.OLEDB.4.0'
  $cfg.sql.powershell = '32'

  $cfg.query.table = 'DeviceLogs'
  $cfg.query.columns.id        = 'DeviceLogId'
  $cfg.query.columns.uid       = 'UserId'
  $cfg.query.columns.punchAt   = 'LogDate'
  $cfg.query.columns.direction = 'Direction'
  $cfg.query.columns.deviceId  = 'DeviceId'
  $cfg.query.cursorMode = 'id'

  # Only yesterday gets closed. Closing a day with no punches marks everyone
  # absent for it, and there is no reason to do that to a week of test data.
  $cfg.sync.backfillDays = 1
  $cfg.sync.intervalSeconds = 60

  $json = $cfg | ConvertTo-Json -Depth 8
  # Node's JSON.parse chokes on a byte-order mark, which is exactly what
  # PowerShell's own -Encoding utf8 would leave here.
  [IO.File]::WriteAllText($CfgPath, $json, (New-Object Text.UTF8Encoding($false)))
  Say "  wrote $CfgPath (office key copied from the real config)" 'Green'
}

function Confirm-Ready {
  if (-not (Test-Path $Mdb)) { New-TestDb }
  if (-not (Test-Path $CfgPath)) { New-TestConfig }
}

function Add-Punch([string]$uid, [datetime]$when, [string]$dir, [string]$device) {
  $d = if ($dir) { "'$dir'" } else { 'NULL' }
  Invoke-Db ("INSERT INTO DeviceLogs (UserId, LogDate, Direction, DeviceId) VALUES " +
             "('$uid', $(Get-JetDate $when), $d, '$device')")
  $shown = if ($dir) { $dir } else { '' }
  Say ("  punch  uid={0}  {1}  {2}" -f $uid, $when.ToString('yyyy-MM-dd HH:mm'), $shown) 'Green'
}

function Show-Rows([int]$count) {
  $conn = Open-Db
  try {
    $rs = $conn.Execute("SELECT TOP $count DeviceLogId, UserId, LogDate, Direction, DeviceId " +
                        "FROM DeviceLogs ORDER BY DeviceLogId DESC")
    if ($rs.EOF) { Say '  (no punches yet)' 'Yellow'; return }
    Say ''
    Say ('  {0,-6} {1,-10} {2,-20} {3,-5} {4}' -f 'id', 'uid', 'punched at', 'dir', 'device')
    Say ('  ' + ('-' * 58))
    while (-not $rs.EOF) {
      $dir = $rs.Fields.Item('Direction').Value
      $dirText = if ($null -eq $dir -or $dir -is [DBNull]) { '-' } else { [string]$dir }
      Say ('  {0,-6} {1,-10} {2,-20} {3,-5} {4}' -f `
        $rs.Fields.Item('DeviceLogId').Value,
        $rs.Fields.Item('UserId').Value,
        ([datetime]$rs.Fields.Item('LogDate').Value).ToString('yyyy-MM-dd HH:mm:ss'),
        $dirText,
        $rs.Fields.Item('DeviceId').Value)
      $rs.MoveNext()
    }
    $rs.Close()
    Say ''
  } finally { $conn.Close() }
}

# ---------------------------------------------------------------- commands --

if ($Reset) {
  if (Test-Path $Mdb) { Remove-Item $Mdb -Force; Say '  deleted the test database' 'Yellow' }
  if (Test-Path $StatePath) { Remove-Item $StatePath -Force; Say '  reset the cursor' 'Yellow' }
  $Init = $true
}

if ($Init) {
  Say ''
  Say 'Setting up the test database' 'Cyan'
  New-TestDb
  New-TestConfig
  Say ''
  Say 'Ready. Next:' 'Cyan'
  Say '  .\tools\test-db.ps1 -Day -Uid 77     # give device number 77 a full day yesterday'
  Say '  .\tools\test-db.ps1 -Sync            # push it to the web app'
  Say ''
  return
}

Confirm-Ready

if ($Clear) {
  Invoke-Db 'DELETE FROM DeviceLogs'
  if (Test-Path $StatePath) { Remove-Item $StatePath -Force }
  Say '  emptied the test database and reset the cursor' 'Yellow'
  return
}

if ($Add) {
  $theUid = Get-Uid $Uid
  if (-not $At) { throw 'Give a time, e.g. -At "2026-08-18 09:12"' }
  Add-Punch $theUid (Get-When $At) $Direction $Device
  return
}

if ($Day) {
  $theUid = Get-Uid $Uid
  # Yesterday by default, and on purpose: the agent only closes days up to
  # yesterday, and the web app refuses to judge a day it has not been told is
  # complete. Punches dated today sync fine but show no status yet.
  $onDate = if ($Date) { (Get-When "$Date 00:00").Date } else { (Get-Date).Date.AddDays(-1) }
  $stamp = $onDate.ToString('yyyy-MM-dd')
  Add-Punch $theUid (Get-When "$stamp $In")  'IN'  $Device
  Add-Punch $theUid (Get-When "$stamp $Out") 'OUT' $Device
  return
}

if ($List) { Show-Rows $Top; return }

if ($Sync) {
  if (-not (Test-Path $AgentPs1)) { throw "Cannot find $AgentPs1" }
  Say ''
  Say 'Running one sync against the TEST database' 'Cyan'
  Say ''
  & powershell -NoProfile -ExecutionPolicy Bypass -File $AgentPs1 -Once -ConfigPath $CfgPath
  return
}

Say ''
Say 'What this does' 'Cyan'
Say "  Stands in for ONtime's database so the whole chain can be tested now."
Say ''
Say 'Commands' 'Cyan'
Say '  -Init                          create the test database and its settings'
Say '  -Day  -Uid 77                  a full day (in + out) yesterday for UID 77'
Say '  -Day  -Uid 77 -In 10:40 -Out 18:00 -Date 2026-08-17'
Say '  -Add  -Uid 77 -At "2026-08-18 09:12" [-Direction IN]'
Say '  -List [-Top 50]                show what is in the test database'
Say '  -Sync                          run one sync into the web app'
Say '  -Clear                         empty it and rewind the cursor'
Say '  -Reset                         delete and rebuild it from scratch'
Say ''
Say "Test database : $Mdb"
Say "Test settings : $CfgPath"
Say ''
