# Tests the exact byte-transfer/encryption functions shipped in the owner recovery kit.
$ErrorActionPreference='Stop'
[Console]::InputEncoding=New-Object System.Text.UTF8Encoding($false)
function New-Process($exe, $arguments, $inputRedirect, $outputRedirect) {
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
if ($PSVersionTable.PSVersion.Major -ne 5) { throw 'Windows PowerShell 5.1 required' }
$env:GNUPGHOME=Join-Path $env:RUNNER_TEMP ('fictional-gpg-'+[Guid]::NewGuid().ToString('N'))
[void](New-Item -ItemType Directory -Path $env:GNUPGHOME)
$gpg=(Get-Command gpg.exe -ErrorAction SilentlyContinue).Source
if (!$gpg) { $gpg='C:\Program Files\Git\usr\bin\gpg.exe' }
if (!(Test-Path -LiteralPath $gpg)) { throw 'GPG unavailable' }
& $gpg --batch --pinentry-mode loopback --passphrase '' --quick-generate-key 'Fictional recovery regression' rsa2048 encr 1d
if ($LASTEXITCODE -ne 0) { throw 'Fixture key creation failed' }
$keys=& $gpg --batch --with-colons --list-keys
$recipient=(($keys | Where-Object {$_ -match '^fpr:'} | Select-Object -First 1) -split ':')[9]
if ($recipient -notmatch '^[A-F0-9]{40}$') { throw 'Fixture fingerprint missing' }
$bytes=New-Object byte[] 262144
for($i=0;$i -lt $bytes.Length;$i++){$bytes[$i]=[byte]($i%256)}
$dest=Join-Path $env:GNUPGHOME 'synthetic-binary.gpg'
Encrypt-Bytes $bytes $dest
Write-Host 'WINDOWS POWERSHELL 5.1 GPG BINARY ROUNDTRIP: PASS (262144 bytes, all byte values, no BOM)'
