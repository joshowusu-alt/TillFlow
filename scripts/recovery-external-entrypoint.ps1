# Owner-operated encrypted external-file backup from the verified local database archive.
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
$recipient = '1E22FC06ACB80162723E29D42D694A8690D2E798'
function Find-Tool($name) {
  $cmd = Get-Command "$name.exe" -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  foreach ($root in @($env:ProgramFiles, ${env:ProgramFiles(x86)})) {
    if (!$root) { continue }
    $paths = @(Get-ChildItem -LiteralPath $root -Filter "$name.exe" -Recurse -ErrorAction SilentlyContinue)
    if ($paths.Count -gt 0) { return $paths[0].FullName }
  }
  throw "Required tool missing: $name"
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
Add-Type -AssemblyName System.Net.Http
$stage='setup'; $client=$null; $process=$null; $archiveMemory=$null
function Encrypt-Bytes([byte[]]$bytes, [string]$destination) {
  $p=New-Process $gpg ('--batch --yes --trust-model always --recipient '+$recipient+' --output "'+$destination+'" --encrypt') $true $false
  try {
    [void]$p.Start(); $err=$p.StandardError.ReadToEndAsync()
    try { $p.StandardInput.BaseStream.Write($bytes,0,$bytes.Length) } finally { $p.StandardInput.Close() }
    $p.WaitForExit(); [void]$err.Result
    if ($p.ExitCode -ne 0) { throw 'Encryption failed' }
  } finally { if (!$p.HasExited) { $p.Kill() }; $p.Dispose() }
  # Confirm byte-exact recovery without writing decrypted files.
  $p=New-Process $gpg ('--decrypt --output - "'+$destination+'"') $false $true
  $mem=New-Object IO.MemoryStream
  try {
    [void]$p.Start(); $err=$p.StandardError.ReadToEndAsync()
    $p.StandardOutput.BaseStream.CopyTo($mem); $p.WaitForExit(); [void]$err.Result
    if ($p.ExitCode -ne 0 -or $mem.Length -ne $bytes.Length) { throw 'Recovery failed' }
    $sha=[Security.Cryptography.SHA256]::Create()
    try {
      $expected=[BitConverter]::ToString($sha.ComputeHash($bytes))
      $mem.Position=0; $actual=[BitConverter]::ToString($sha.ComputeHash($mem))
      if ($actual -cne $expected) { throw 'Recovered bytes differ' }
    } finally { $sha.Dispose() }
  } finally {
    if (!$p.HasExited) { $p.Kill() }; $p.Dispose()
    if ($mem.Length -gt 0) { [Array]::Clear($mem.GetBuffer(),0,[int]$mem.Length) }; $mem.Dispose()
  }
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

try {
  Write-Host 'TillFlow external-file backup R4. LOCAL archive references; NO database connection.'
  $gpg=Find-Tool 'gpg'; $pgrestore=Find-Tool 'pg_restore'
  $process=New-Process $gpg ('--batch --with-colons --list-keys '+$recipient) $false $true
  [void]$process.Start();$err=$process.StandardError.ReadToEndAsync();$keyInfo=$process.StandardOutput.ReadToEnd();$process.WaitForExit();[void]$err.Result
  if ($process.ExitCode -ne 0 -or $keyInfo -notmatch ('(?m)^fpr:::::::::'+$recipient+':')) { throw 'Expected public key missing' }
  $process.Dispose();$process=$null
  $folder=Join-Path $env:USERPROFILE 'OneDrive\TillFlow Encrypted Backups'
  if (!(Test-Path -LiteralPath $folder -PathType Container)) { throw 'Expected backup folder missing' }
  $stage='find-verified-local-backup'
  $expected='122A81FE3DEB45AC7C04AFC4A5CB1E0BFE17568EAF4BC00FC0992BE655857905'
  $backup=$null
  foreach ($candidate in @(Get-ChildItem -LiteralPath $folder -Filter '*.dump.gpg' -File)) {
    if ((Get-FileHash -LiteralPath $candidate.FullName -Algorithm SHA256).Hash -ceq $expected) { $backup=$candidate.FullName;break }
  }
  if (!$backup) {
    Add-Type -AssemblyName System.Windows.Forms
    $dialog=New-Object Windows.Forms.OpenFileDialog
    $dialog.Title='Choose the ORIGINAL verified TillFlow production .dump.gpg backup'
    $dialog.InitialDirectory=$folder;$dialog.Filter='Encrypted database backup (*.dump.gpg)|*.dump.gpg'
    if ($dialog.ShowDialog() -ne 'OK') { throw 'Cancelled' }
    $backup=$dialog.FileName;$dialog.Dispose()
    if ((Get-FileHash -LiteralPath $backup -Algorithm SHA256).Hash -cne $expected) { throw 'Unexpected backup checksum' }
  }
  Write-Host 'ORIGINAL ENCRYPTED DATABASE BACKUP CHECKSUM: PASS'
  $stage='decrypt-verified-archive-in-memory'
  $archiveMemory=New-Object IO.MemoryStream
  $process=New-Process $gpg ('--decrypt --output - "'+$backup+'"') $false $true
  [void]$process.Start();$err=$process.StandardError.ReadToEndAsync()
  Write-Host 'Enter your GPG passphrase privately if prompted. No database URL is needed.'
  $process.StandardOutput.BaseStream.CopyTo($archiveMemory);$process.WaitForExit();[void]$err.Result
  if ($process.ExitCode -ne 0) { throw 'Backup decryption failed' }
  $process.Dispose();$process=$null
  $bytes=$archiveMemory.GetBuffer();$offset=0;$magic=[Text.Encoding]::ASCII.GetBytes('PGDMP')
  $plainHeader=$archiveMemory.Length -ge 5
  for($i=0;$i -lt 5;$i++){if($bytes[$i] -ne $magic[$i]){$plainHeader=$false}}
  $bomHeader=$archiveMemory.Length -ge 8 -and $bytes[0] -eq 239 -and $bytes[1] -eq 187 -and $bytes[2] -eq 191
  for($i=0;$i -lt 5;$i++){if($bytes[$i+3] -ne $magic[$i]){$bomHeader=$false}}
  if ($plainHeader) { $offset=0 } elseif($bomHeader) { $offset=3 } else { throw 'Unexpected archive header' }
  $archiveMemory.Position=$offset
  $stage='read-local-archive-file-references'
  $refs=@(Get-ArchiveReferences $archiveMemory $pgrestore)
  [Array]::Clear($archiveMemory.GetBuffer(),0,[int]$archiveMemory.Length);$archiveMemory.Dispose();$archiveMemory=$null;$bytes=$null
  Write-Host ('LOCAL ARCHIVE FILE REFERENCES: PASS ('+$refs.Count+' references)')
  $web=@($refs | Where-Object { $_.u -match '^https://mk8jj77w2uohrpv1[.]public[.]blob[.]vercel-storage[.]com/' } | ForEach-Object { $_.u } | Sort-Object -Unique -CaseSensitive)
  $thirdParty=@($refs | Where-Object { $_.u -match '^https://' -and $_.u -notmatch '^https://mk8jj77w2uohrpv1[.]public[.]blob[.]vercel-storage[.]com/' } | ForEach-Object { $_.u } | Sort-Object -Unique -CaseSensitive)
  foreach ($link in $thirdParty) { if (([Uri]$link).Host -ne 'www.nestle-cwa.com') { throw 'Unreviewed third-party reference' } }
  if ($web.Count -eq 0) { throw 'No external files discovered; refusing an empty success' }
  foreach ($ref in $refs) {
    if ($ref.u -notmatch '^https://' -and $ref.u -notmatch '^data:image/') { throw 'Uncovered local or insecure file reference' }
  }
  foreach ($address in $web) {
    $u=[Uri]$address
    if ($u.Host -notin @('mk8jj77w2uohrpv1.public.blob.vercel-storage.com','www.nestle-cwa.com') -or !$u.IsDefaultPort -or $u.UserInfo) { throw 'Unreviewed file host' }
  }
  $run=Join-Path $folder ('TillFlow-external-'+[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss')+'-'+[Guid]::NewGuid().ToString('N').Substring(0,8))
  [void](New-Item -ItemType Directory -Path $run)
  $handler=New-Object Net.Http.HttpClientHandler; $handler.AllowAutoRedirect=$false
  $client=New-Object Net.Http.HttpClient($handler); $client.Timeout=[TimeSpan]::FromSeconds(90)
  $manifest=New-Object Collections.ArrayList; $index=0
  foreach ($address in $web) {
    $index++; $stage='download-file-'+$index
    $response=$client.GetAsync($address,[Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
    try {
      if (!$response.IsSuccessStatusCode) { throw 'File unavailable or redirected' }
      if ($response.Content.Headers.ContentType.MediaType -eq 'text/html') { throw 'Expected asset, received HTML' }
      if ($response.Content.Headers.ContentLength -gt 33554432) { throw 'File exceeds memory limit' }
      $assetStream=$response.Content.ReadAsStreamAsync().GetAwaiter().GetResult(); $mem=New-Object IO.MemoryStream
      try {
        $buffer=New-Object byte[] 65536
        while (($n=$assetStream.Read($buffer,0,$buffer.Length)) -gt 0) {
          if ($mem.Length+$n -gt 33554432) { throw 'File exceeds memory limit' }
          $mem.Write($buffer,0,$n)
        }
        $bytes=$mem.ToArray()
      } finally { $assetStream.Dispose(); $mem.Dispose(); [Array]::Clear($buffer,0,$buffer.Length) }
      try {
        $stage='encrypt-and-verify-file-'+$index
        $name=('file-{0:D4}.gpg' -f $index); $dest=Join-Path $run ($name+'.partial')
        Encrypt-Bytes $bytes $dest
        Move-Item -LiteralPath $dest -Destination (Join-Path $run $name)
        $sha=[Security.Cryptography.SHA256]::Create()
        try { $hash=[BitConverter]::ToString($sha.ComputeHash($bytes)).Replace('-','') } finally { $sha.Dispose() }
        [void]$manifest.Add(@{url=$address;file=$name;bytes=$bytes.Length;sha256=$hash;encryptedSha256=(Get-FileHash -LiteralPath (Join-Path $run $name) -Algorithm SHA256).Hash})
        Write-Host ('Encrypted and recovery-verified file '+$index+' of '+$web.Count)
      } finally { if ($bytes) { [Array]::Clear($bytes,0,$bytes.Length) }; $bytes=$null }
    } finally { $response.Dispose() }
  }
  $stage='encrypt-reference-manifest'
  $json=@{revision=4;sourceDatabaseEncryptedSha256=$expected;capturedUtc=[DateTime]::UtcNow.ToString('o');references=$refs;files=@($manifest);databaseBackupSeparate=$true;thirdPartyReferencesNotArchived=$thirdParty;thirdPartyNote='Known third-party image reference returns a webpage or access denial; original reference preserved, image not recovered.'} | ConvertTo-Json -Depth 8
  $bytes=[Text.Encoding]::UTF8.GetBytes($json)
  try { Encrypt-Bytes $bytes (Join-Path $run 'manifest.json.gpg') } finally { [Array]::Clear($bytes,0,$bytes.Length);$json=$null }
  [IO.File]::WriteAllText((Join-Path $run 'COMPLETE.txt'),('External backup R4: '+$web.Count+' files; all encrypted and byte-exact decryption checked. Manifest is encrypted. '+[DateTime]::UtcNow.ToString('o')))
  Write-Host ('TILLFLOW-HOSTED FILE BACKUP AND RECOVERY CHECK: PASS ('+$web.Count+' files)')
  if ($thirdParty.Count -gt 0) { Write-Host ('KNOWN EXCEPTION: '+$thirdParty.Count+' third-party webpage reference preserved in manifest; not an archived image.') }
  Write-Host ('Saved in '+$run)
  Write-Host 'Wait for the folder to show a OneDrive green sync tick. Share only this status screen.'
} catch {
  Write-Host ('NOT COMPLETE. Safe diagnostic step: '+$stage)
  Write-Host ('Local exception type: '+$_.Exception.GetType().Name)
  Write-Host 'Keep the encrypted partial folder. No private error text or credentials displayed.'
} finally {
  if ($process) { try { if (!$process.HasExited) { $process.Kill() } } catch {}; $process.Dispose() }
  if ($client) { $client.Dispose() }
  if ($archiveMemory) { if ($archiveMemory.Length -gt 0) { [Array]::Clear($archiveMemory.GetBuffer(),0,[int]$archiveMemory.Length) };$archiveMemory.Dispose() }
  $refs=$null;$manifest=$null;$bytes=$null
  [void](Read-Host 'Press Enter to close')
}
