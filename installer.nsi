; HTML 编辑器 - NSIS 安装版
Unicode true
Name "HTML 编辑器"
OutFile "release\HtmlEditor-Setup.exe"
RequestExecutionLevel user
InstallDir "$LOCALAPPDATA\Programs\HtmlEditor"
InstallDirRegKey HKCU "Software\HtmlEditor" "InstallDir"
Icon "assets\icon.ico"
UninstallIcon "assets\icon.ico"
SetCompressor /SOLID lzma
ShowInstDetails hide
ShowUninstDetails hide

!define APPNAME "HTML 编辑器"
!define VERSION "1.0.0"
!define PUBLISHER "HTML Editor"
!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\HtmlEditor"

!include "MUI2.nsh"
!define MUI_ABORTWARNING
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

Section "主程序" SecCore
  SetOutPath "$INSTDIR"
  File /r "release\win-unpacked\*.*"
  WriteRegStr HKCU "Software\HtmlEditor" "InstallDir" "$INSTDIR"
  CreateDirectory "$SMPROGRAMS\HTML 编辑器"
  CreateShortCut "$SMPROGRAMS\HTML 编辑器\HTML 编辑器.lnk" "$INSTDIR\HtmlEditor.exe"
  CreateShortCut "$SMPROGRAMS\HTML 编辑器\卸载.lnk" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayName" "${APPNAME}"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayIcon" "$INSTDIR\HtmlEditor.exe"
  WriteRegStr HKCU "${UNINST_KEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINST_KEY}" "Publisher" "${PUBLISHER}"
  WriteRegStr HKCU "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
SectionEnd

Section "桌面快捷方式" SecDesktop
  CreateShortCut "$DESKTOP\HTML 编辑器.lnk" "$INSTDIR\HtmlEditor.exe"
SectionEnd

Section Uninstall
  Delete "$DESKTOP\HTML 编辑器.lnk"
  Delete "$SMPROGRAMS\HTML 编辑器\HTML 编辑器.lnk"
  Delete "$SMPROGRAMS\HTML 编辑器\卸载.lnk"
  RMDir "$SMPROGRAMS\HTML 编辑器"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "Software\HtmlEditor"
  DeleteRegKey HKCU "${UNINST_KEY}"
SectionEnd
