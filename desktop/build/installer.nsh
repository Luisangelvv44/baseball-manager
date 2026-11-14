; Página final del instalador (electron-builder la incluye sola desde build/installer.nsh).
; La de serie abre el juego con ExecShellAsUser sobre el acceso directo del menú Inicio
; recién creado y, en Windows 10, Explorer a veces aún no lo encuentra: "Windows no puede
; encontrar el archivo ...\Baseball Manager.lnk". Aquí se abre el .exe instalado directamente.
!macro customFinishPage
  Function StartApp
    ${if} ${isUpdated}
      StrCpy $1 "--updated"
    ${else}
      StrCpy $1 ""
    ${endif}
    ${StdUtils.ExecShellAsUser} $0 "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "open" "$1"
  FunctionEnd

  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
  !insertmacro MUI_PAGE_FINISH
!macroend
