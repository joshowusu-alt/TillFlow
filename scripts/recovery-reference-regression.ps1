# Only fictional CI data. These functions match the owner R3 archive reader exactly.
$ErrorActionPreference='Stop'
[Console]::InputEncoding=New-Object Text.UTF8Encoding($false)
function New-LegacyProcess($exe, $arguments, $inputRedirect, $outputRedirect) {
  $p = New-Object System.Diagnostics.Process
  $p.StartInfo.FileName = $exe
  $p.StartInfo.Arguments = $arguments
  $p.StartInfo.UseShellExecute = $false
  $p.StartInfo.CreateNoWindow = $true
  $p.StartInfo.RedirectStandardInput = $inputRedirect
  if ($inputRedirect -and $p.StartInfo.PSObject.Properties['StandardInputEncoding']) { $p.StartInfo.StandardInputEncoding = New-Object System.Text.UTF8Encoding($false) }
  $p.StartInfo.RedirectStandardOutput = $outputRedirect
  $p.StartInfo.RedirectStandardError = $true
  return $p
}
function New-Process($exe, $arguments, $inputRedirect, $outputRedirect) {
  if ($inputRedirect) {
    [Console]::InputEncoding = New-Object Text.UTF8Encoding($false)
    if ([Console]::InputEncoding.GetPreamble().Length -ne 0) { throw 'Binary input encoding guard failed' }
  }
  $p = New-Object System.Diagnostics.Process
  $p.StartInfo.FileName = $exe
  $p.StartInfo.Arguments = $arguments
  $p.StartInfo.UseShellExecute = $false
  $p.StartInfo.CreateNoWindow = $true
  $p.StartInfo.RedirectStandardInput = $inputRedirect
  if ($inputRedirect -and $p.StartInfo.PSObject.Properties['StandardInputEncoding']) { $p.StartInfo.StandardInputEncoding = New-Object System.Text.UTF8Encoding($false) }
  $p.StartInfo.RedirectStandardOutput = $outputRedirect
  $p.StartInfo.RedirectStandardError = $true
  return $p
}
function ConvertFrom-CopyText([string]$value) {
  if ($value -ceq '\N') { return $null }
  return [regex]::Replace($value,'\\([0-7]{1,3}|x[0-9A-Fa-f]{1,2}|.)', [Text.RegularExpressions.MatchEvaluator]{ param($match)
    $v=$match.Groups[1].Value
    switch -CaseSensitive ($v) {
      'b' { return [string][char]8 }
      'f' { return [string][char]12 }
      'n' { return "`n" }
      'r' { return "`r" }
      't' { return "`t" }
      'v' { return [string][char]11 }
      '\' { return '\' }
      default {
        if ($v -match '^[0-7]{1,3}$') { return [string][char][Convert]::ToInt32($v,8) }
        if ($v -match '^x[0-9A-Fa-f]{1,2}$') { return [string][char][Convert]::ToInt32($v.Substring(1),16) }
        return $v
      }
    }
  })
}
function Get-ReferencesFromCopySql([string]$sqlText) {
  $fields=@{ Product=@('imageUrl');Category=@('imageUrl');OnlineOrderLine=@('imageUrl');Business=@('receiptLogoUrl','storefrontLogoUrl','logoUrl','brandCompactLogoUrl','brandSquareLogoUrl');Expense=@('attachmentPath');CashVarianceInvestigation=@('evidencePath');ControlSupportIssue=@('attachmentUrl') }
  $refs=New-Object Collections.ArrayList
  $seen=@{}; $table=$null; $columns=@(); $reader=New-Object IO.StringReader($sqlText)
  try {
    while ($null -ne ($line=$reader.ReadLine())) {
      if (!$table) {
        if ($line -cmatch '^COPY public\."?([A-Za-z][A-Za-z0-9_]*)"? \((.+)\) FROM stdin;$') {
          $table=$Matches[1];$columns=@($Matches[2].Split(',') | ForEach-Object {$_.Trim().Trim('"')})
          if (!$fields.ContainsKey($table)) { throw 'Unexpected COPY table' }
          if ($seen.ContainsKey($table)) { throw 'Duplicate COPY table' }
          if ($columns.IndexOf('id') -lt 0) { throw 'COPY id column missing' }
          foreach ($field in $fields[$table]) { if ($columns.IndexOf($field) -lt 0) { throw 'Expected file column missing' } }
          $seen[$table]=$true
        }
        continue
      }
      if ($line -ceq '\.') { $table=$null;continue }
      $values=$line.Split([char]9)
      if ($values.Length -ne $columns.Count) { throw 'COPY column count mismatch' }
      $id=ConvertFrom-CopyText $values[$columns.IndexOf('id')]
      foreach ($field in $fields[$table]) {
        $value=ConvertFrom-CopyText $values[$columns.IndexOf($field)]
        if ($null -ne $value -and $value -cne '') { [void]$refs.Add(@{t=$table;r=$id;c=$field;u=$value}) }
      }
    }
    if ($table) { throw 'Unterminated COPY section' }
    foreach ($name in $fields.Keys) { if (!$seen.ContainsKey($name)) { throw 'Expected COPY section missing' } }
    return $refs.ToArray()
  } finally { $reader.Dispose() }
}
function Get-ArchiveReferences($archiveMemory,[string]$pgrestore) {
  # No --dbname, connection URL, SQL execution or production connection exists.
  $arguments='--data-only --no-owner --no-acl --file=- --table=Product --table=Category --table=OnlineOrderLine --table=Business --table=Expense --table=CashVarianceInvestigation --table=ControlSupportIssue'
  $p=New-Process $pgrestore $arguments $true $true
  $p.StartInfo.StandardOutputEncoding=New-Object Text.UTF8Encoding($false)
  try {
    [void]$p.Start();$err=$p.StandardError.ReadToEndAsync();$result=$p.StandardOutput.ReadToEndAsync()
    if ($p.StandardInput.Encoding.GetPreamble().Length -ne 0) { throw 'Reader input encoding guard failed' }
    $writeError=$null
    try { $archiveMemory.CopyTo($p.StandardInput.BaseStream) } catch { $writeError=$_.Exception }
    finally { try { $p.StandardInput.Close() } catch { if (!$writeError) { $writeError=$_.Exception } } }
    $p.WaitForExit();[void]$err.Result
    if ($p.ExitCode -ne 0) { throw 'Archive reference reader failed' }
    # A selective pg_restore can finish and close stdin before the unselected
    # tail is consumed. Only accept that I/O close after a successful exit and
    # complete, validated COPY sections for every required table. GPG has already
    # verified the ENTIRE encrypted archive before any of this is attempted.
    $refs=@(Get-ReferencesFromCopySql $result.Result)
    if ($writeError) {
      $io=$writeError;$isIo=$false
      while ($io) { if ($io -is [IO.IOException]) { $isIo=$true };$io=$io.InnerException }
      if (!$isIo) { throw $writeError }
    }
    return $refs
  } finally { if (!$p.HasExited) { $p.Kill() };$p.Dispose() }
}

if($PSVersionTable.PSVersion.Major -ne 5){throw 'PowerShell5.1 required'}
$pgrestore=(Get-Command pg_restore.exe -ErrorAction SilentlyContinue).Source
if(!$pgrestore){$pgrestore=Get-ChildItem 'C:\Program Files\PostgreSQL' -Filter pg_restore.exe -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName}
if(!$pgrestore){throw 'Runner PostgreSQL client missing'}
$archiveMemory=New-Object IO.MemoryStream
$archiveBytes=[IO.File]::ReadAllBytes((Join-Path (Get-Location) 'fictional-reference.dump'))
$archiveMemory.Write($archiveBytes,0,$archiveBytes.Length);$archiveMemory.Position=0
# Reproduce the old writer failure on valid bytes, without a BOM: the reader
# succeeds and exits once the selected sections are complete, before a large
# unselected trailing table. The archive is fully valid and all references exist.
[Console]::InputEncoding=New-Object Text.UTF8Encoding($false)
$baseline=New-Process $pgrestore '--data-only --no-owner --no-acl --file=- --table=Product --table=Category --table=OnlineOrderLine --table=Business --table=Expense --table=CashVarianceInvestigation --table=ControlSupportIssue' $true $true
[void]$baseline.Start();$be=$baseline.StandardError.ReadToEndAsync();$bo=$baseline.StandardOutput.ReadToEndAsync()
$baselineFailure=$false;$baselineType='none'
try{$archiveMemory.CopyTo($baseline.StandardInput.BaseStream)}catch{$baselineFailure=$true;$baselineType=$_.Exception.GetType().Name}finally{try{$baseline.StandardInput.Close()}catch{$baselineFailure=$true}}
$baseline.WaitForExit();[void]$be.Result;$baselineRefs=@(Get-ReferencesFromCopySql $bo.Result)
if(!$baselineFailure -or $baseline.ExitCode -ne 0 -or $baselineRefs.Count -ne 3){throw 'The specific early-close failure did not reproduce'}
Write-Host ('LEGACY SELECTIVE PIPE FAILURE REPRODUCED: '+$baselineType+'; pg_restore exit 0; all selected reference sections complete')
$baseline.Dispose();$archiveMemory.Position=0
# Also protect against any native tool changing the global console encoding.
[Console]::InputEncoding=New-Object Text.UTF8Encoding($true)
$refs=@(Get-ArchiveReferences $archiveMemory $pgrestore)
if($refs.Count -ne 3){throw 'Incorrect archive references count'}
if(($refs | Where-Object {$_.t -eq 'Product'}).u -cne 'https://mk8jj77w2uohrpv1.public.blob.vercel-storage.com/fictional.png'){throw 'Product mapping changed'}
if(($refs | Where-Object {$_.t -eq 'Business'}).u -cne 'data:image/png;base64,AA=='){throw 'Inline reference changed'}
if((ConvertFrom-CopyText 'a\tb\\c') -cne "a`tb\c"){throw 'COPY escape handling changed'}
$archiveMemory.Dispose()
$bad=New-Object IO.MemoryStream
$bad.WriteByte(0);$bad.Position=0;$rejected=$false
try{Get-ArchiveReferences $bad $pgrestore|Out-Null}catch{$rejected=$true}
if(!$rejected){throw 'Corrupt archive accepted'}
$bad.Dispose()
Write-Host 'WINDOWS POWERSHELL 5.1 LOCAL ARCHIVE REFERENCES: PASS (real pg_dump archive, real pg_restore, 7 tables, 3 references, corrupt archive rejected)'
