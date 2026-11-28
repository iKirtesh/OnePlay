; Adds "Play with OnePlay" to the right-click menu of every video and audio file.
!macro customInstall
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\video\shell\PlayWithOnePlay" "" "Play with OnePlay"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\video\shell\PlayWithOnePlay" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\video\shell\PlayWithOnePlay\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\audio\shell\PlayWithOnePlay" "" "Play with OnePlay"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\audio\shell\PlayWithOnePlay" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\audio\shell\PlayWithOnePlay\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
!macroend
!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\video\shell\PlayWithOnePlay"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\audio\shell\PlayWithOnePlay"
!macroend
