!macro customInit
  SetShellVarContext all
  ; Stop existing service as early as possible to unlock the binary for extraction
  DetailPrint "Stopping existing HN Station Ingestion Service..."
  nsExec::Exec 'net stop HNStationIngest'
!macroend

!macro customInstall
  SetShellVarContext all
  DetailPrint "Creating shared data directory..."
  ; With SetShellVarContext all, $APPDATA points to C:\ProgramData
  CreateDirectory "$APPDATA\HNStation"
  ; Grant full access to Everyone so the user app can write to the DB
  nsExec::Exec 'icacls "$APPDATA\HNStation" /grant Everyone:(OI)(CI)F'
  
  DetailPrint "Updating HN Station Ingestion Service..."
  ; Stop and delete in case the previous stop failed or paths changed
  nsExec::Exec 'net stop HNStationIngest'
  nsExec::Exec 'sc delete HNStationIngest'
  
  nsExec::Exec '"$INSTDIR\resources\hn-local.exe" --install'
  nsExec::Exec 'net start HNStationIngest'
!macroend

!macro customUnInstall
  SetShellVarContext all
  DetailPrint "Removing HN Station Ingestion Service..."
  nsExec::Exec 'net stop HNStationIngest'
  nsExec::Exec 'sc delete HNStationIngest'
  nsExec::Exec '"$INSTDIR\resources\hn-local.exe" --remove'
!macroend
