!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr HKCU "Software\Classes\Directory\shell\RadishMD" "" "用 RadishMD 打开"
  WriteRegStr HKCU "Software\Classes\Directory\shell\RadishMD" "MUIVerb" "用 RadishMD 打开"
  WriteRegStr HKCU "Software\Classes\Directory\shell\RadishMD" "Icon" "$INSTDIR\radishmd.exe"
  WriteRegStr HKCU "Software\Classes\Directory\shell\RadishMD\command" "" '"$INSTDIR\radishmd.exe" "%1"'

  WriteRegStr HKCU "Software\Classes\Folder\shell\RadishMD" "" "用 RadishMD 打开"
  WriteRegStr HKCU "Software\Classes\Folder\shell\RadishMD" "MUIVerb" "用 RadishMD 打开"
  WriteRegStr HKCU "Software\Classes\Folder\shell\RadishMD" "Icon" "$INSTDIR\radishmd.exe"
  WriteRegStr HKCU "Software\Classes\Folder\shell\RadishMD\command" "" '"$INSTDIR\radishmd.exe" "%1"'

  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\RadishMD" "" "用 RadishMD 打开"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\RadishMD" "MUIVerb" "用 RadishMD 打开"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\RadishMD" "Icon" "$INSTDIR\radishmd.exe"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\RadishMD\command" "" '"$INSTDIR\radishmd.exe" "%V"'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegKey HKCU "Software\Classes\Directory\shell\RadishMD"
  DeleteRegKey HKCU "Software\Classes\Folder\shell\RadishMD"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\RadishMD"
!macroend
