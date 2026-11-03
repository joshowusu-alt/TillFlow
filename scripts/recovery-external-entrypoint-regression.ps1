# Full owner entrypoint with fictional archive and controlled GPG/HTTP adapters.
# Real GPG byte encryption is covered by the separate Windows Recovery Binary Gate.
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Net.Http
$fixtureRoot=Join-Path $env:RUNNER_TEMP ('external-entrypoint-'+[Guid]::NewGuid().ToString('N'))
[void](New-Item -ItemType Directory -Path $fixtureRoot)
$bin=Join-Path $fixtureRoot 'bin';[void](New-Item -ItemType Directory -Path $bin)
$folder=Join-Path $fixtureRoot 'backup';[void](New-Item -ItemType Directory -Path $folder)
$archive=Join-Path $folder 'fictional.dump.gpg'
Copy-Item './fictional-reference.dump' $archive
$fingerprint='1E22FC06ACB80162723E29D42D694A8690D2E798'
$fakeGpg=@'
using System;using System.IO;
public class FictionalGpgAdapter {
 public static int Main(string[] a){
  if(Array.IndexOf(a,"--list-keys")>=0){Console.WriteLine("fpr:::::::::1E22FC06ACB80162723E29D42D694A8690D2E798:");return 0;}
  if(Array.IndexOf(a,"--encrypt")>=0){int n=Array.IndexOf(a,"--output");using(var o=File.Create(a[n+1])){Console.OpenStandardInput().CopyTo(o);}return 0;}
  if(Array.IndexOf(a,"--decrypt")>=0){using(var i=File.OpenRead(a[a.Length-1])){i.CopyTo(Console.OpenStandardOutput());}return 0;}
  return 2;
 }
}
'@
Add-Type -TypeDefinition $fakeGpg -OutputAssembly (Join-Path $bin 'gpg.exe') -OutputType ConsoleApplication
Add-Type -TypeDefinition @'
using System;using System.Net;using System.Net.Http;using System.Net.Http.Headers;using System.Threading;using System.Threading.Tasks;
public class FictionalImageHandler:HttpMessageHandler {
 public bool AllowAutoRedirect{get;set;}
 protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken token){
  if(request.RequestUri.Host!="mk8jj77w2uohrpv1.public.blob.vercel-storage.com")throw new Exception("Unapproved fictional host");
  var bytes=new byte[65536];for(int i=0;i<bytes.Length;i++)bytes[i]=(byte)(i%256);
  var r=new HttpResponseMessage(HttpStatusCode.OK);r.Content=new ByteArrayContent(bytes);r.Content.Headers.ContentType=new MediaTypeHeaderValue("image/png");return Task.FromResult(r);
 }
}
'@ -ReferencedAssemblies System.Net.Http.dll,System.dll,System.Core.dll
$pgrestore=(Get-Command pg_restore.exe -ErrorAction SilentlyContinue).Source
if(!$pgrestore){$pgrestore=Get-ChildItem 'C:\Program Files\PostgreSQL' -Filter pg_restore.exe -Recurse | Select-Object -First 1 -ExpandProperty FullName}
if(!$pgrestore){throw 'PostgreSQL client unavailable'}
$env:PATH=$bin+';'+[IO.Path]::GetDirectoryName($pgrestore)+';'+$env:PATH
# Adapt only the fixture's directory/checksum and HTTP transport. No real owner data.
$s=[IO.File]::ReadAllText((Join-Path (Get-Location) 'scripts/recovery-external-entrypoint.ps1'))
$s=$s.Replace("`$folder=Join-Path `$env:USERPROFILE 'OneDrive\TillFlow Encrypted Backups'", "`$folder='"+$folder.Replace("'","''")+"'")
$s=$s.Replace('122A81FE3DEB45AC7C04AFC4A5CB1E0BFE17568EAF4BC00FC0992BE655857905',(Get-FileHash $archive -Algorithm SHA256).Hash)
$s=$s.Replace('New-Object Net.Http.HttpClientHandler','New-Object FictionalImageHandler')
function Read-Host { param([string]$Prompt) return '' }
$fixtureScript=Join-Path $fixtureRoot 'entrypoint.ps1'
[IO.File]::WriteAllText($fixtureScript,$s,(New-Object Text.UTF8Encoding($true)))
& $fixtureScript
$runs=@(Get-ChildItem $folder -Directory -Filter 'TillFlow-external-*')
if($runs.Count -ne 1 -or !(Test-Path (Join-Path $runs[0].FullName 'COMPLETE.txt'))){throw 'Full entrypoint did not complete'}
# Adapter encryption is identity only; inspect the strictly fictional manifest.
$manifest=Get-Content (Join-Path $runs[0].FullName 'manifest.json.gpg') -Raw | ConvertFrom-Json
if(@($manifest.files).Count -ne 1 -or @($manifest.references).Count -ne 3){throw 'Manifest mapping/count mismatch'}
if(@($manifest.thirdPartyReferencesNotArchived).Count -ne 1){throw 'Third-party exception lost'}
$file=Join-Path $runs[0].FullName $manifest.files[0].file
if((Get-FileHash $file -Algorithm SHA256).Hash -cne $manifest.files[0].sha256){throw 'Recovered image hash mismatch'}
if((Get-Item $file).Length -ne 65536){throw 'Recovered image length mismatch'}
Write-Host 'FULL WINDOWS EXTERNAL BACKUP ENTRYPOINT: PASS (fictional archive, reference filtering, download, process I/O, byte recovery, manifest, completion marker)'
