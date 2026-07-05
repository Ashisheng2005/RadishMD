!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr HKCU "Software\Classes\Directory\shell\RadishMD" "" "Open with RadishMD"
  WriteRegStr HKCU "Software\Classes\Directory\shell\RadishMD" "Icon" "$INSTDIR\radishmd.exe"
  WriteRegStr HKCU "Software\Classes\Directory\shell\RadishMD\command" "" '"$INSTDIR\radishmd.exe" "%1"'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegKey HKCU "Software\Classes\Directory\shell\RadishMD"
!macroend
