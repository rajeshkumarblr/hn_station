!macro customInit
  SetShellVarContext all
!macroend

!macro customInstall
  SetShellVarContext all
  DetailPrint "Creating shared data directory..."
  ; With SetShellVarContext all, $APPDATA points to C:\ProgramData
  CreateDirectory "$APPDATA\HNStation"
  ; Grant full access to Everyone so the user app can write to the DB
  nsExec::Exec 'icacls "$APPDATA\HNStation" /grant Everyone:(OI)(CI)F'
!macroend

!macro customUnInstall
  SetShellVarContext all
!macroend
