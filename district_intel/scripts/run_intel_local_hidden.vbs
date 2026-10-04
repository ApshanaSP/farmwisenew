' Runs run_intel_local.bat with no window, so the hourly collection cannot be interrupted by closing a console.
' Task Scheduler starts this through wscript.exe (see run_intel_local.bat for the schedule).
Set sh = CreateObject("WScript.Shell")
dir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
sh.Run """" & dir & "\run_intel_local.bat""", 0, True
