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

node (Join-Path $PSScriptRoot 'prepare-editor.mjs') (Join-Path $editor 'resources/app.asar')
if ($LASTEXITCODE -ne 0) { throw 'Creator importer startup fix failed' }

function Prepare-Project {
  # A bad first import can persist fallback metadata. Isolate retries completely;
  # the editor startup fix above prevents the importer registration race itself.
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
  # Every attempt gets its own project path so persisted editor state can never leak
  # from a failed attempt into the next one.
  $project = Join-Path $work "project-attempt$attempt"
  Prepare-Project
  if (Test-Path (Join-Path $build 'web-mobile')) { Remove-Item -Recurse -Force (Join-Path $build 'web-mobile') }
  if (Test-Path $log) { Remove-Item $log }
  $attemptDiagnostics = Join-Path $diagnostics "attempt-$attempt"
  New-Item -ItemType Directory -Force $attemptDiagnostics | Out-Null
  Write-Host "Starting Web Mobile build (attempt $attempt/$maxAttempts)"
  $process = Start-Process (Join-Path $editor 'CocosCreator.exe') -PassThru -RedirectStandardOutput (Join-Path $attemptDiagnostics 'stdout.log') -RedirectStandardError (Join-Path $attemptDiagnostics 'stderr.log') -ArgumentList ('--project "{0}" --build "{1}"' -f $project, $options)
  $timedOut = $false
  try {
    if (!$process.WaitForExit(360000)) {
      taskkill.exe /PID $process.Id /T /F | Out-Null
      $timedOut = $true
    }
  } finally {
    foreach ($directory in @((Join-Path $project 'temp'), (Join-Path $project 'profiles'), (Join-Path $env:APPDATA 'CocosCreator'))) {
      if (Test-Path $directory) {
        Get-ChildItem $directory -Recurse -File -Include '*.log' | ForEach-Object {
          Copy-Item $_.FullName (Join-Path $attemptDiagnostics (([guid]::NewGuid().ToString()) + '-' + $_.Name))
        }
      }
    }
    if (Test-Path $log) {
      Copy-Item $log (Join-Path $attemptDiagnostics 'build.log')
      Get-Content $log -Tail 100
    }
    # Preserve import metadata to distinguish incomplete startup from source errors.
    Copy-Item -Recurse (Join-Path $project 'assets') (Join-Path $attemptDiagnostics 'assets')
    Get-Content (Join-Path $attemptDiagnostics 'stderr.log') -Tail 100
  }
  $exitCode = $process.ExitCode
  $missing = @('index.html', 'src/chunks/bundle.js', 'assets/resources/config.json') | Where-Object {
    $path = Join-Path (Join-Path $build 'web-mobile') $_
    !(Test-Path $path -PathType Leaf) -or (Get-Item $path).Length -eq 0
  }
  if (!$timedOut -and $exitCode -eq 36 -and @($missing).Count -eq 0) { $succeeded = $true; break }
  $reason = "exit=$exitCode; timedOut=$timedOut; missing/empty=$($missing -join ', ')"
  $reason | Set-Content (Join-Path $attemptDiagnostics 'failure.txt')
  Write-Warning "Cocos attempt $attempt rejected: $reason"
  if (Test-Path (Join-Path $build 'web-mobile')) { Remove-Item -Recurse -Force (Join-Path $build 'web-mobile') }
}
if (-not $succeeded) { throw "Cocos Creator failed after $maxAttempts attempts (last exit code $exitCode)" }
if (!(Test-Path (Join-Path $build 'web-mobile/index.html'))) { throw 'Web Mobile index.html missing' }
Write-Host "Cocos Creator build succeeded after $attempt attempt(s) with exit code 36"
