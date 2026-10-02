; Moon Zip's additions to the electron-builder NSIS installer (picked up from build/installer.nsh).
; The pictures next to this file come from build/installer/*.svg (npm run icons).

; ---------------------------------------------------------------- the Moon look

; This file is included before MUI2.nsh, so these colours win over its white defaults: the welcome
; and finish pages and the page header are night-sky (#141030, the --color-night-900 of the Moon
; theme) with moon-white text (#f4f1ff), and the pictures fade into exactly that colour.
!ifndef MUI_BGCOLOR
  !define MUI_BGCOLOR "141030"
!endif
!ifndef MUI_TEXTCOLOR
  !define MUI_TEXTCOLOR "F4F1FF"
!endif
; The list of installed files: moon-white on night.
!ifndef MUI_INSTFILESPAGE_COLORS
  !define MUI_INSTFILESPAGE_COLORS "F4F1FF 141030"
!endif
!define MUI_INSTFILESPAGE_PROGRESSBAR "smooth"

; ---------------------------------------------------------------- welcome page

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Welcome to Moon Zip"
  !define MUI_WELCOMEPAGE_TEXT "Your archives, calmly under the moon.$\r$\n$\r$\nThis sets up Moon Zip ${VERSION}: open, extract and create 7z, ZIP, RAR, TAR, ISO and 40 more formats, with 7-Zip inside and the Moon night-sky look outside.$\r$\n$\r$\nNo administrator rights are needed when you install it for yourself.$\r$\n$\r$\nClick Next to continue."
  !insertmacro skipPageIfUpdated
  !insertmacro MUI_PAGE_WELCOME
!macroend

; ---------------------------------------------------------------- finish page

!macro customFinishPage
  Function StartApp
    ${if} ${isUpdated}
      StrCpy $1 "--updated"
    ${else}
      StrCpy $1 ""
    ${endif}
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
  FunctionEnd

  ; Runs as the signed-in user even if the installer was elevated, so the menu lands in their HKCU.
  Function AddToRightClickMenu
    ${StdUtils.ExecShellAsUser} $0 "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "open" "--register-shell"
  FunctionEnd

  !define MUI_FINISHPAGE_TITLE "Moon Zip is ready"
  !define MUI_FINISHPAGE_TEXT "Moon Zip is installed. You find it in the Start menu and on the desktop.$\r$\n$\r$\nRight-click an archive for $\"Extract with Moon Zip$\", or any file or folder for $\"Compress with Moon Zip$\". You can switch the menu off at any time in Settings."
  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_TEXT "Start Moon Zip"
  !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
  ; Ticked by default, like 7-Zip's and NanaZip's own menu.
  !define MUI_FINISHPAGE_SHOWREADME
  !define MUI_FINISHPAGE_SHOWREADME_TEXT "Add Moon Zip to the right-click menu"
  !define MUI_FINISHPAGE_SHOWREADME_FUNCTION "AddToRightClickMenu"
  !insertmacro MUI_PAGE_FINISH
!macroend

; ---------------------------------------------------------------- uninstall

!macro customUnWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Uninstall Moon Zip"
  !define MUI_WELCOMEPAGE_TEXT "This removes Moon Zip and its entries in the right-click menu and in $\"Open with$\".$\r$\n$\r$\nYour archives stay just where they are.$\r$\n$\r$\nClick Next to continue."
  !insertmacro MUI_UNPAGE_WELCOME
!macroend

; Takes Moon Zip out of the right-click menu and "Open with" before the app is removed, so no menu
; item points at a missing program. Not on an update: the new version keeps the menu.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    ExecWait '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --unregister-shell'
  ${endIf}
!macroend
