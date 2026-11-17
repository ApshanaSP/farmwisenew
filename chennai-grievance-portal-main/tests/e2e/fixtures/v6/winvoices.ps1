# v6 latency clips, English part: Windows' own voices (synthetic; no third-party audio). SAPI desktop voices (David, Zira) and the
# OneCore voices through WinRT (Ravi and Heera, Indian English; Mark). Reads clips.json ("source": "win"), writes raw/<name>.wav.
#   powershell -ExecutionPolicy Bypass -File tests/e2e/fixtures/v6/winvoices.ps1
$ErrorActionPreference = "Stop"
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$clips = Get-Content (Join-Path $dir "clips.json") -Raw -Encoding UTF8 | ConvertFrom-Json
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, [Type]$t) { $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(-1) | Out-Null; $task.Result }
$all = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices
foreach ($p in $clips.PSObject.Properties) {
  $c = $p.Value
  if ($c.source -ne "win") { continue }
  $out = Join-Path $dir "raw\$($p.Name).wav"
  if (Test-Path $out) { continue }
  $s = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
  $v = $all | Where-Object { $_.DisplayName -like "*$($c.voice)*" } | Select-Object -First 1
  if (-not $v) { throw "no voice $($c.voice)" }
  $s.Voice = $v
  $st = Await ($s.SynthesizeTextToStreamAsync($c.text)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
  $size = [uint32]$st.Size
  $r = New-Object Windows.Storage.Streams.DataReader($st.GetInputStreamAt(0))
  $null = Await ($r.LoadAsync($size)) ([uint32])
  $bytes = New-Object byte[] $size
  $r.ReadBytes($bytes)
  [IO.File]::WriteAllBytes($out, $bytes)
  "$($p.Name) $($v.DisplayName) $size"
}
