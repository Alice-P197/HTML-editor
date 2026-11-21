; HtmlEditor Portable - single file self-extractor
; On run: silently extract to .\HtmlEditor next to the exe, then launch the editor.
Unicode true
Name "HtmlEditor"
OutFile "release\HtmlEditor-Desktop.exe"
RequestExecutionLevel user
InstallDir "$EXEDIR\HtmlEditor"
Icon "assets\icon.ico"
SetCompressor /SOLID zlib
SetOverwrite on
SilentInstall silent

Section ""
  RMDir /r "$INSTDIR"
  SetOutPath "$INSTDIR"
  File /r "release\win-unpacked\*.*"
  ExecWait '"$INSTDIR\HtmlEditor.exe"'
SectionEnd
