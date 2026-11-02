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
$fixtureRoot=Join-Path $env:RUNNER_TEMP ('fictional-gpg-'+[Guid]::NewGuid().ToString('N'))
[void](New-Item -ItemType Directory -Path $fixtureRoot)
$gpg=@('C:\Program Files (x86)\GnuPG\bin\gpg.exe','C:\Program Files\GnuPG\bin\gpg.exe') | Where-Object {Test-Path -LiteralPath $_} | Select-Object -First 1
$msys=$false
if (!$gpg) { $gpg='C:\Program Files\Git\usr\bin\gpg.exe';$msys=$true }
if (!(Test-Path -LiteralPath $gpg)) { throw 'Windows GPG unavailable' }
# Git's GPG uses POSIX paths. This conversion is fixture-only, not owner launcher logic.
function Gpg-Path([string]$value) {
  if ($msys) { return '/'+$value.Substring(0,1).ToLower()+$value.Substring(2).Replace('\','/') }
  return $value
}
$env:GNUPGHOME=Gpg-Path $fixtureRoot
$passfile=Join-Path $fixtureRoot 'empty-passphrase.txt'
[IO.File]::WriteAllText($passfile,'')
& $gpg --batch --pinentry-mode loopback --passphrase-file (Gpg-Path $passfile) --quick-generate-key 'Fictional recovery regression' rsa2048 encr 1d
if ($LASTEXITCODE -ne 0) { throw 'Fixture key creation failed' }
$keys=& $gpg --batch --with-colons --list-keys
$recipient=(($keys | Where-Object {$_ -match '^fpr:'} | Select-Object -First 1) -split ':')[9]
if ($recipient -notmatch '^[A-F0-9]{40}$') { throw 'Fixture fingerprint missing' }
$bytes=New-Object byte[] 262144
for($i=0;$i -lt $bytes.Length;$i++){$bytes[$i]=[byte]($i%256)}
$dest=Gpg-Path (Join-Path $fixtureRoot 'synthetic-binary.gpg')
Encrypt-Bytes $bytes $dest
Write-Host 'WINDOWS POWERSHELL 5.1 GPG BINARY ROUNDTRIP: PASS (262144 bytes, all byte values, no BOM)'
