<#
  Reads the biometric software's Microsoft Access database for the sync agent.

  Node cannot open an .mdb on its own, and every npm package that claims to
  either needs a compiler on the office PC or is long abandoned. Windows can
  already do it: the ACE OLE DB provider that ONtime itself uses is sitting on
  that machine. This script is the bridge to it, and it needs nothing installed.

  Output is one compact JSON object per line rather than a single array.
  PowerShell 5.1 serialises a one-element array as a bare object, which would
  make "1 punch" and "many punches" arrive in different shapes.

  Nothing here writes. Every statement it runs is a SELECT built by the agent.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidateSet('query', 'tables', 'columns')][string]$Mode,
  [string]$Table
)

$ErrorActionPreference = 'Stop'

# The connection string carries the database password, so it arrives through
# the environment. A command line is readable by every user on the machine.
$connectionString = $env:FTECH_ACE_CONN
if (-not $connectionString) { throw 'FTECH_ACE_CONN is not set' }

Add-Type -AssemblyName System.Data

function Convert-Value($value) {
  if ($null -eq $value) { return $null }
  if ($value -is [System.DBNull]) { return $null }
  # Access stores wall-clock time with no zone. Hand it over as written and let
  # the agent read it in the office's own timezone.
  if ($value -is [datetime]) { return $value.ToString('yyyy-MM-ddTHH:mm:ss') }
  if ($value -is [byte[]]) { return [Convert]::ToBase64String($value) }
  return $value
}

function Write-Row($row) {
  [Console]::Out.WriteLine((ConvertTo-Json $row -Compress -Depth 4))
}

# OLE DB reports a column's type as a number. Discover exists so a person can
# read the list and fill in the config, and "130" tells them nothing.
$typeNames = @{
  2 = 'Integer'; 3 = 'Long Integer'; 4 = 'Single'; 5 = 'Double'; 6 = 'Currency'
  7 = 'Date/Time'; 11 = 'Yes/No'; 17 = 'Byte'; 20 = 'Big Integer'; 72 = 'GUID'
  128 = 'Binary'; 129 = 'Text'; 130 = 'Text'; 131 = 'Decimal'; 133 = 'Date'
  134 = 'Time'; 135 = 'Date/Time'; 200 = 'Text'; 202 = 'Text'; 203 = 'Memo'
  204 = 'Binary'; 205 = 'OLE Object'
}

function Get-TypeName($code) {
  $n = 0
  if (-not [int]::TryParse([string]$code, [ref]$n)) { return [string]$code }
  if ($typeNames.ContainsKey($n)) { return $typeNames[$n] }
  return "type $n"
}

$conn = New-Object System.Data.OleDb.OleDbConnection $connectionString
$conn.Open()

try {
  switch ($Mode) {
    # ACE rejects GetSchema's restriction array outright ("the parameter is
    # incorrect"), so both of these read the whole column list once and filter
    # it here. An Access database is small enough that this costs nothing.
    'tables' {
      $allColumns = $conn.GetSchema('Columns')
      $countByTable = @{}
      foreach ($r in $allColumns.Rows) {
        $t = [string]$r['TABLE_NAME']
        $countByTable[$t] = 1 + [int]$countByTable[$t]
      }
      foreach ($r in $conn.GetSchema('Tables').Rows) {
        # Skips the MSys* bookkeeping tables Access keeps for itself.
        if ($r['TABLE_TYPE'] -ne 'TABLE') { continue }
        $name = [string]$r['TABLE_NAME']
        Write-Row @{ TABLE_SCHEMA = 'access'; TABLE_NAME = $name; ColumnCount = [int]$countByTable[$name] }
      }
    }

    'columns' {
      if (-not $Table) { throw 'columns mode needs -Table' }
      $matching = $conn.GetSchema('Columns').Rows |
        Where-Object { [string]$_['TABLE_NAME'] -eq $Table } |
        Sort-Object { [int]$_['ORDINAL_POSITION'] }
      foreach ($r in $matching) {
        $nullable = 'NO'
        if ($r['IS_NULLABLE'] -eq $true -or $r['IS_NULLABLE'] -eq 'YES') { $nullable = 'YES' }
        Write-Row @{
          COLUMN_NAME = [string]$r['COLUMN_NAME']
          DATA_TYPE   = Get-TypeName $r['DATA_TYPE']
          IS_NULLABLE = $nullable
        }
      }
    }

    'query' {
      $sql = $env:FTECH_ACE_SQL
      if (-not $sql) { throw 'FTECH_ACE_SQL is not set' }
      $cmd = $conn.CreateCommand()
      $cmd.CommandText = $sql
      $reader = $cmd.ExecuteReader()
      try {
        while ($reader.Read()) {
          $row = [ordered]@{}
          for ($i = 0; $i -lt $reader.FieldCount; $i++) {
            $row[$reader.GetName($i)] = Convert-Value $reader.GetValue($i)
          }
          Write-Row $row
        }
      }
      finally {
        $reader.Close()
      }
    }
  }
}
finally {
  $conn.Close()
}
