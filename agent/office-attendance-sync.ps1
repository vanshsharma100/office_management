<#
  Ftech Office Attendance Sync launcher

  A thin wrapper around this project's agent (agent\src\index.js) so the whole
  setup is one command at a time instead of remembering node invocations. The
  agent does the real work: it reads ONtime's database, pushes punches to the
  web app, and only marks a day complete once its punches have safely landed.

  Everything you need, in order:

    .\office-attendance-sync.ps1 -Init             make the settings file
    .\office-attendance-sync.ps1 -ShowSchema       find ONtime's table names
    .\office-attendance-sync.ps1 -TestConnection   check both ends
    .\office-attendance-sync.ps1 -DataRange        what dates ONtime actually holds
    .\office-attendance-sync.ps1 -Once             one sync, then stop
    .\office-attendance-sync.ps1 -InstallTask      run forever, from boot  (admin)

  Run -DataRange before pulling in older months. It tells you how far back the
  punches really go, and therefore how high sync.backfillDays may safely be.

  And when you need them:

    .\office-attendance-sync.ps1 -Status           is it installed and running?
    .\office-attendance-sync.ps1 -ResetCursor      re-read the database from the start
    .\office-attendance-sync.ps1 -Uninstall        remove the scheduled task  (admin)

  With no switches it runs the agent in the foreground forever. That is what
  the scheduled task does.
#>
[CmdletBinding()]
param(
  [switch]$Init,
  [switch]$ShowSchema,
  [switch]$TestConnection,
  [switch]$DataRange,
  [int]$Days = 120,
  [switch]$Once,
  [switch]$InstallTask,
  [switch]$Uninstall,
  [switch]$Status,
  [switch]$ResetCursor,
  [string]$ConfigPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$AgentRoot = $PSScriptRoot
$AgentEntry = Join-Path $AgentRoot 'src\index.js'
$TaskName = 'Ftech Attendance Sync'

function Assert-Administrator([string]$what) {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal] $identity
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Open Windows PowerShell as Administrator, then run $what again."
  }
}

function Get-NodePath {
  $node = Get-Command node.exe -ErrorAction SilentlyContinue
  if (-not $node) { $node = Get-Command node -ErrorAction SilentlyContinue }
  if (-not $node) {
    throw 'Node.js 20 or newer is required. Install it from https://nodejs.org, then run this script again.'
  }
  return $node.Source
}

<#
  The scheduled task runs as SYSTEM, which does not see a per-user PATH. Node's
  installer normally writes to the machine PATH, but "normally" is not good
  enough for something that would otherwise fail silently at 3am after a
  reboot, so this is checked before the task is ever created.
#>
function Test-NodeVisibleToSystem([string]$nodePath) {
  $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $nodeDir = Split-Path -Parent $nodePath
  foreach ($entry in $machinePath -split ';') {
    if ([string]::IsNullOrWhiteSpace($entry)) { continue }
    if ($entry.TrimEnd('\') -ieq $nodeDir.TrimEnd('\')) { return $true }
  }
  return $false
}

function Get-StatePath {
  if (-not [string]::IsNullOrWhiteSpace($ConfigPath)) {
    return Join-Path (Split-Path -Parent ([IO.Path]::GetFullPath($ConfigPath))) 'state.json'
  }
  return Join-Path $env:ProgramData 'Ftech\sync-agent\state.json'
}

function Get-AgentArguments {
  $arguments = New-Object System.Collections.Generic.List[string]

  if ($Init) { $arguments.Add('--init') }
  elseif ($ShowSchema) { $arguments.Add('--discover') }
  elseif ($TestConnection) { $arguments.Add('--test') }
  elseif ($DataRange) { $arguments.Add('--range'); $arguments.Add([string]$Days) }
  elseif ($Once) { $arguments.Add('--once') }

  if (-not [string]::IsNullOrWhiteSpace($ConfigPath)) {
    $arguments.Add('--config')
    # --init is allowed to create a new config file, so it may not exist yet.
    $resolvedConfigPath = if ($Init) {
      [IO.Path]::GetFullPath($ConfigPath)
    }
    else {
      (Resolve-Path -LiteralPath $ConfigPath -ErrorAction Stop).Path
    }
    $arguments.Add($resolvedConfigPath)
  }

  return , $arguments.ToArray()
}

function Invoke-Agent {
  if (-not (Test-Path -LiteralPath $AgentEntry)) {
    throw "The project agent was not found at $AgentEntry"
  }

  $nodePath = Get-NodePath
  $arguments = Get-AgentArguments
  if ($arguments.Count -gt 0) { & $nodePath $AgentEntry @arguments }
  else { & $nodePath $AgentEntry }
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

function Install-SyncTask {
  Assert-Administrator '-InstallTask'

  $nodePath = Get-NodePath
  if (-not (Test-NodeVisibleToSystem $nodePath)) {
    Write-Warning @"
Node is at $nodePath, but that folder is not on the machine-wide PATH.
The task runs as SYSTEM and would not find it after a reboot. Add it with:
  setx /M PATH "%PATH%;$(Split-Path -Parent $nodePath)"
then run -InstallTask again.
"@
  }

  $powershellExe = "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe"
  $taskArgs = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$PSCommandPath`""
  if (-not [string]::IsNullOrWhiteSpace($ConfigPath)) {
    $resolvedConfigPath = (Resolve-Path -LiteralPath $ConfigPath -ErrorAction Stop).Path
    $taskArgs += " -ConfigPath `"$resolvedConfigPath`""
  }

  $action = New-ScheduledTaskAction -Execute $powershellExe -Argument $taskArgs

  # Two triggers. Boot is the one that matters: it is what makes a PC that was
  # off for days catch up the moment it comes back. The daily one is a safety
  # net for a PC that is never rebooted; MultipleInstances=IgnoreNew means it
  # does nothing while the agent is already running.
  $triggers = @(
    (New-ScheduledTaskTrigger -AtStartup),
    (New-ScheduledTaskTrigger -Daily -At 6am)
  )

  $settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -RestartInterval (New-TimeSpan -Minutes 5) `
    -RestartCount 99 `
    -ExecutionTimeLimit ([TimeSpan]::Zero)

  # ExecutionTimeLimit defaults to 72 hours. The agent is meant to run
  # continuously, so the default would have Windows kill it every three days
  # and leave attendance quietly un-synced until the next reboot. Zero is
  # "no limit". RestartCount covers the agent dying for any other reason.

  $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest

  Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $triggers `
    -Settings $settings `
    -Principal $principal `
    -Description 'Ftech Office biometric attendance sync agent.' `
    -Force | Out-Null

  Start-ScheduledTask -TaskName $TaskName
  Write-Host "Installed '$TaskName' and started it."
  Write-Host 'It runs at boot, restarts itself if it fails, and syncs every 15 minutes.'
  Write-Host "Check it any time with:  .\office-attendance-sync.ps1 -Status"
}

function Uninstall-SyncTask {
  Assert-Administrator '-Uninstall'
  $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if (-not $task) {
    Write-Host "'$TaskName' is not installed."
    return
  }
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "Removed '$TaskName'. Your settings and sync position are untouched."
}

function Show-Status {
  $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if (-not $task) {
    Write-Host "Scheduled task : not installed  (run -InstallTask as Administrator)"
  }
  else {
    $info = Get-ScheduledTaskInfo -TaskName $TaskName
    Write-Host "Scheduled task : $($task.State)"
    Write-Host "Last run       : $($info.LastRunTime)  (result $($info.LastTaskResult))"
    Write-Host "Next run       : $($info.NextRunTime)"
  }

  $statePath = Get-StatePath
  if (Test-Path -LiteralPath $statePath) {
    $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    $lastId = if ($state.PSObject.Properties.Name -contains 'lastId') { $state.lastId } else { '-' }
    $lastAt = if ($state.PSObject.Properties.Name -contains 'lastPunchAt') { $state.lastPunchAt } else { '-' }
    $days = if ($state.PSObject.Properties.Name -contains 'completedDates') { @($state.completedDates).Count } else { 0 }
    Write-Host ''
    Write-Host "Sync position  : row $lastId, last punch $lastAt"
    Write-Host "Days confirmed : $days"
  }
  else {
    Write-Host ''
    Write-Host "Sync position  : nothing synced yet ($statePath does not exist)"
  }
}

<#
  Forget how far we got, so the next run re-reads the vendor database from the
  very beginning. This is the thing to run when you want months of history that
  predate the agent.

  Safe by design: every punch carries ONtime's own row identity, and the web
  app rejects one it already holds. Re-sending costs bandwidth, never duplicate
  attendance.
#>
function Reset-Cursor {
  $statePath = Get-StatePath
  if (-not (Test-Path -LiteralPath $statePath)) {
    Write-Host "Nothing to reset. $statePath does not exist, so the next run already starts from the beginning."
    return
  }
  $backup = "$statePath.bak"
  Copy-Item -LiteralPath $statePath -Destination $backup -Force
  Remove-Item -LiteralPath $statePath -Force
  Write-Host "Cursor reset. The previous position was saved to:"
  Write-Host "  $backup"
  Write-Host ''
  Write-Host 'The next run re-reads the whole database. Already-known punches are'
  Write-Host 'rejected by the web app, so nothing is counted twice.'
  Write-Host 'Set sync.backfillDays high enough to cover the months you want closed.'
}

$actions = @($Init, $ShowSchema, $TestConnection, $DataRange, $Once, $InstallTask, $Uninstall, $Status, $ResetCursor)
# The @() matters: under Set-StrictMode a one-item pipeline result has no
# .Count, so picking a single action would fail before it ever ran.
$chosen = @($actions | Where-Object { $_ })
if ($chosen.Count -gt 1) {
  throw 'Pick one action at a time.'
}

if ($InstallTask) { Install-SyncTask; exit 0 }
if ($Uninstall) { Uninstall-SyncTask; exit 0 }
if ($Status) { Show-Status; exit 0 }
if ($ResetCursor) { Reset-Cursor; exit 0 }

Invoke-Agent
