$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$work = Join-Path $env:RUNNER_TEMP 'trunk-cocos'
$archive = Join-Path $work 'creator.zip'
$editor = Join-Path $work 'editor'
$project = Join-Path $work 'project'
$build = Join-Path $root 'client/build'
$log = Join-Path $root 'cocos-build.log'

New-Item -ItemType Directory -Force $work, $build | Out-Null
if (!(Test-Path $archive) -or (Get-Item $archive).Length -ne 1027270586) {
  Write-Host 'Downloading Cocos Creator 3.8.8'
  curl.exe --fail --location --no-progress-meter --retry 2 --retry-max-time 1200 --max-time 900 'https://download.cocos.com/CocosCreator/v3.8.8/CocosCreator-v3.8.8-win-121518.zip' -o $archive
  if ($LASTEXITCODE -ne 0) { throw 'Cocos Creator archive download failed' }
  if ((Get-Item $archive).Length -ne 1027270586) { throw 'Unexpected Cocos Creator archive size' }
}
Write-Host 'Extracting the editor archive'
7z x "-o$editor" -y -bso0 -bsp0 $archive
if ($LASTEXITCODE -ne 0) { throw 'Cocos Creator archive extraction failed' }

function Prepare-Project {
  # Always start from a pristine synthetic project. A failed attempt can leave the
  # editor's asset DB resumable, and a resumed build can finish with exit code 36 while
  # silently dropping the script bundles from the output, so retries never reuse state.
  if (Test-Path $project) { Remove-Item -Recurse -Force $project }
  if (Test-Path (Join-Path $env:APPDATA 'CocosCreator')) { Remove-Item -Recurse -Force (Join-Path $env:APPDATA 'CocosCreator') }
  Copy-Item -Recurse (Join-Path $editor 'resources/templates/empty-2d') $project
  Copy-Item -Recurse (Join-Path $root 'client/assets') $project
  $scenes = Join-Path $project 'assets/scenes'
  New-Item -ItemType Directory -Force $scenes | Out-Null
  $template = Join-Path $editor 'resources/resources/3d/engine/editor/assets/default_file_content/scene/scene-2d.scene'
  Copy-Item $template (Join-Path $scenes 'Main.scene')

  $package = Join-Path $project 'package.json'
  @{
    name = 'trunk-home'
    uuid = [guid]::NewGuid().ToString()
    creator = @{ version = '3.8.8' }
  } | ConvertTo-Json | Set-Content -Encoding utf8NoBOM $package
}
Prepare-Project

Write-Host 'Starting Web Mobile build'
# Forward slashes avoid backslash escapes in Creator's build-option parser.
$options = "platform=web-mobile;debug=true;buildPath=$($build.Replace('\','/'));outputName=web-mobile;logDest=$($log.Replace('\','/'))"
$diagnostics = Join-Path $root 'cocos-diagnostics'
New-Item -ItemType Directory -Force $diagnostics | Out-Null
# The editor build can be lost to transient asset-database / start-scene races on hosted
# runners even when download and extraction succeeded. Retry bounded attempts and keep the
# diagnostics of every attempt so the CI failure report stays evidence-based.
$maxAttempts = 3
$succeeded = $false
$exitCode = $null
for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
  Write-Host "Starting Web Mobile build (attempt $attempt/$maxAttempts)"
  $process = Start-Process (Join-Path $editor 'CocosCreator.exe') -PassThru -RedirectStandardOutput (Join-Path $diagnostics 'stdout.log') -RedirectStandardError (Join-Path $diagnostics 'stderr.log') -ArgumentList ('--project "{0}" --build "{1}"' -f $project, $options)
  $timedOut = $false
  try {
    if (!$process.WaitForExit(360000)) {
      Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
      $timedOut = $true
    }
  } finally {
    foreach ($directory in @((Join-Path $project 'temp'), (Join-Path $project 'profiles'), (Join-Path $env:APPDATA 'CocosCreator'))) {
      if (Test-Path $directory) {
        Get-ChildItem $directory -Recurse -File -Include '*.log' | ForEach-Object {
          Copy-Item $_.FullName (Join-Path $diagnostics (([guid]::NewGuid().ToString()) + '-' + $_.Name))
        }
      }
    }
    if (Test-Path $log) { Get-Content $log -Tail 100 }
    Get-Content (Join-Path $diagnostics 'stderr.log') -Tail 100
  }
  if ($timedOut) { throw 'Cocos Creator did not exit after six minutes' }
  $exitCode = $process.ExitCode
  if ($exitCode -eq 36) { $succeeded = $true; break }
  Write-Warning "Cocos Creator exited with code $exitCode on attempt $attempt; retrying"
  if (Test-Path (Join-Path $build 'web-mobile')) { Remove-Item -Recurse -Force (Join-Path $build 'web-mobile') }
  Prepare-Project
}
if (-not $succeeded) { throw "Cocos Creator failed after $maxAttempts attempts (last exit code $exitCode)" }
if (!(Test-Path (Join-Path $build 'web-mobile/index.html'))) { throw 'Web Mobile index.html missing' }
Write-Host "Cocos Creator build succeeded after $attempt attempt(s) with exit code 36"
