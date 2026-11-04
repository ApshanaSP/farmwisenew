# Speech fixtures for the end-to-end specs, spoken by Windows' own SAPI voices (synthetic, no third-party audio).
#   powershell -ExecutionPolicy Bypass -File tests/e2e/fixtures/make.ps1
Add-Type -AssemblyName System.Speech
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$clips = @{
  "cmd_adyar"  = "Show the severe cases in Adyar."
  "cmd_trends" = "Go to the trends page."
  "cmd_zone"   = "Show Anna Nagar on the map."
  "wait"       = "Wait."
  "b1" = "No, show me Anna Nagar instead of that."
  "b2" = "Stop there and open the first case please."
  "b3" = "What about the rain in Perungudi today?"
  "b4" = "Compare that with last month for Royapuram."
  "b5" = "Hold on, go to the briefing page right now."
  "b6" = "Show me the flooding complaints in Velachery."
  "b7" = "Actually read me the news from this morning."
  "b8" = "Change it to the weekly view for the whole district."
  "answer" = "Adyar has nine severe cases today, most of them waterlogging on the main roads near the bridge. Perungudi is second with blocked drains and four severe cases. The Storm Water Drains department has the most of them open, and two are past their deadline. I have put the list on the screen beside the map."
}
$voices = @("Microsoft David Desktop", "Microsoft Zira Desktop")
$i = 0
foreach ($k in $clips.Keys) {
  $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
  try { $s.SelectVoice($voices[$i % 2]) } catch { }
  $i++
  $s.SetOutputToWaveFile((Join-Path $dir "$k.wav"), $fmt)
  $s.Speak($clips[$k])
  $s.Dispose()
}
Get-ChildItem $dir -Filter *.wav | ForEach-Object { "$($_.Name) $($_.Length)" }
