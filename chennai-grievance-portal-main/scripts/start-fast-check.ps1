# Used by start-fast.bat before it starts the site (17 Nov 2026).
#  1. Stops a site already running on port 3000 (usually "npm run dev", the slow development server: it compiles each
#     page on first use, 15-40 s per click on this PC, and grew to 6 GB of memory). The fast site takes its place.
#  2. Says whether the fast build is out of date: exit code 1 when there is no build yet, or when any code, setting or
#     package file is newer than the build (a code change, a "git pull" of a friend's commits, an upgraded Next.js).
#     An out-of-date build either shows old code or does not start at all (the 2 Nov build crashed under Next.js 15.5).
param([string]$Dist = ".next-prod", [int]$Port = 3000)

$listen = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
foreach ($procId in ($listen.OwningProcess | Sort-Object -Unique)) {
  $p = Get-CimInstance Win32_Process -Filter "ProcessId=$procId" -ErrorAction SilentlyContinue
  if ($p -and $p.Name -eq "node.exe") {
    Write-Host "Closing the District IQ server already running on port $Port (process $procId) so the fast one can start..."
    # the whole tree: the "npm run dev" window's next.js parent would otherwise start it again
    $parent = Get-CimInstance Win32_Process -Filter "ProcessId=$($p.ParentProcessId)" -ErrorAction SilentlyContinue
    if ($parent -and $parent.CommandLine -match "next") { taskkill /PID $parent.ProcessId /T /F | Out-Null } else { taskkill /PID $procId /T /F | Out-Null }
  } elseif ($p) {
    Write-Host "Port $Port is used by $($p.Name) (process $procId). Close it, then run start-fast.bat again."
    exit 2
  }
}

$stamp = Join-Path $Dist "BUILD_ID"
if (-not (Test-Path $stamp)) { exit 1 }
$built = (Get-Item $stamp).LastWriteTime
# folders are searched through; single files are looked at alone (PowerShell 5.1 would search the whole tree,
# node_modules included, for every file named like them if they were given to -Recurse)
$files = @("package.json", "package-lock.json", "next.config.js", "tsconfig.json", "postcss.config.js", "tailwind.config.ts", "tailwind.config.js") |
  Where-Object { Test-Path $_ -PathType Leaf } | ForEach-Object { Get-Item $_ }
$inDirs = Get-ChildItem -Path "src", "public" -Recurse -File -ErrorAction SilentlyContinue
$newer = @($files) + @($inDirs) |
  Where-Object { $_ -and $_.LastWriteTime -gt $built -and $_.Name -notmatch "\.test\.tsx?$" } | Select-Object -First 1
if ($newer) {
  Write-Host "The code has changed since the last build ($($newer.FullName) is newer)."
  exit 1
}
exit 0
