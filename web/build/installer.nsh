!macro customInstall
  SetShellVarContext all
  DetailPrint "Creating shared data directory..."
  CreateDirectory "$APPDATA\HNStation"
  ; Grant full access to Everyone so the user app can write to the DB
  nsExec::Exec 'icacls "$APPDATA\HNStation" /grant Everyone:(OI)(CI)F'
  
  DetailPrint "Registering HN Station Ingestion Service..."
  nsExec::Exec '"$INSTDIR\resources\hn-local.exe" --install'
  nsExec::Exec 'net start HNStationIngest'
!macroend

!macro customUnInstall
  SetShellVarContext all
  DetailPrint "Removing HN Station Ingestion Service..."
  nsExec::Exec 'net stop HNStationIngest'
  nsExec::Exec '"$INSTDIR\resources\hn-local.exe" --remove'
!macroend
