; ABPlayer Fork's maintenance and one-time original-profile import.
Var ForkMaintenance
Var ForkUpdate
Var ForkUninstallOnly
Var ForkImportOriginal
Var ForkImportCheckbox

Function ForkDetectMaintenance
  ReadRegStr $0 SHCTX "${UNINSTKEY}" "UninstallString"
  ${If} $0 == ""
    Return
  ${EndIf}

  StrCpy $ForkMaintenance 1
  Call RestorePreviousInstallLocation
  ReadRegStr $0 SHCTX "${UNINSTKEY}" "DisplayVersion"
  nsis_tauri_utils::SemverCompare "${VERSION}" $0
  Pop $0
  ${If} $0 = -1
    IfSilent +2
      MessageBox MB_OK|MB_ICONEXCLAMATION "A newer ABPlayer Fork is already installed. Use its installer or remove it first."
    SetErrorLevel 3
    Abort
  ${ElseIf} $0 <> 0
    StrCpy $ForkUpdate 1
    StrCpy $UpdateMode 1
  ${EndIf}
FunctionEnd

Function ForkUpdatePage
  Call SkipIfPassive
  !insertmacro MUI_HEADER_TEXT "Update ABPlayer Fork" "Install version ${VERSION} in the current location"
  nsDialogs::Create 1018
  Pop $0
  ${IfThen} $0 == error ${|} Abort ${|}
  ${NSD_CreateLabel} 0 0 100% 70u "Setup will back up the existing profile before updating program files. Your library, listening progress, bookmarks and settings will be kept.$\r$\n$\r$\nAutomatic backups: $APPDATA\${BUNDLEID}-backups"
  Pop $0
  nsDialogs::Show
FunctionEnd

Function ForkSkipDirectory
  Call SkipIfPassive
  ${IfThen} $ForkMaintenance = 1 ${|} Abort ${|}
FunctionEnd

!macro ForkWaitForProcessBody
  Exch $0
  Push $1
  check_process:
    nsis_tauri_utils::FindProcessCurrentUser "$0"
    Pop $1
    ${If} $1 = 0
      IfSilent blocked_process
      MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$\"$0$\" is running.$\r$\nPause playback and close the app normally to save your listening position, then choose Retry." IDRETRY check_process
      blocked_process:
        SetErrorLevel 2
        Abort
    ${EndIf}
  Pop $1
  Pop $0
!macroend

!macro ForkRequireClosedBody scope
  Push "${MAINBINARYNAME}.exe"
  Call ${scope}ForkWaitForProcess
  ReadRegStr $0 SHCTX "${UNINSTKEY}" "MainBinaryName"
  ${If} $0 == "abplayer.exe"
    Push "abplayer.exe"
    Call ${scope}ForkWaitForProcess
  ${EndIf}
!macroend

Function ForkRequireClosed
  !insertmacro ForkRequireClosedBody ""
FunctionEnd

Function un.ForkRequireClosed
  !insertmacro ForkRequireClosedBody "un."
FunctionEnd

Function ForkBackupFailed
  DetailPrint "Automatic profile backup failed. Program files were not replaced."
  IfSilent no_backup_dialog
    MessageBox MB_OK|MB_ICONSTOP "Setup could not create and verify the profile backup. No program files were updated.$\r$\n$\r$\nQuit ABPlayer Fork and check available disk space and write access to:$\r$\n$APPDATA\${BUNDLEID}-backups$\r$\n$\r$\nThen run setup again."
  no_backup_dialog:
  SetErrorLevel 4
  Abort
FunctionEnd

Function ForkWaitForProcess
  !insertmacro ForkWaitForProcessBody
FunctionEnd

Function un.ForkWaitForProcess
  !insertmacro ForkWaitForProcessBody
FunctionEnd

Function ForkOriginalProfilePage
  Call SkipIfPassive
  ${If} $ForkMaintenance = 1
  ${OrIf} ${FileExists} "$APPDATA\${BUNDLEID}\."
  ${OrIfNot} ${FileExists} "$APPDATA\com.abplayer.app\library.json"
    Abort
  ${EndIf}

  !insertmacro MUI_HEADER_TEXT "Copy your ABPlayer library" "Bring your listening data into ABPlayer Fork"
  nsDialogs::Create 1018
  Pop $0
  ${IfThen} $0 == error ${|} Abort ${|}
  ${NSD_CreateLabel} 0 0 100% 45u "Setup found a library from the original ABPlayer. You can copy it along with saved positions, bookmarks, covers and settings. The original profile stays in place."
  Pop $0
  ${NSD_CreateCheckbox} 0 52u 100% 14u "Copy data from the original ABPlayer"
  Pop $ForkImportCheckbox
  ${NSD_SetState} $ForkImportCheckbox $ForkImportOriginal
  nsDialogs::Show
FunctionEnd

Function ForkLeaveOriginalProfilePage
  ${NSD_GetState} $ForkImportCheckbox $0
  ${If} $0 = ${BST_CHECKED}
    StrCpy $ForkImportOriginal ${BST_CHECKED}
    Push "abplayer.exe"
    Call ForkWaitForProcess
  ${Else}
    StrCpy $ForkImportOriginal ${BST_UNCHECKED}
  ${EndIf}
FunctionEnd

!macro NSIS_HOOK_POSTINSTALL
  ${If} $ForkImportOriginal = ${BST_CHECKED}
    nsis_tauri_utils::FindProcessCurrentUser "abplayer.exe"
    Pop $0
    ${If} $0 = 0
      MessageBox MB_OK|MB_ICONEXCLAMATION "The original ABPlayer was reopened. Close it before copying its profile with the migration script."
    ${Else}
      ClearErrors
      ExecWait '"$INSTDIR\${MAINBINARYNAME}.exe" --import-original-profile' $0
      ${If} ${Errors}
      ${OrIf} $0 <> 0
        MessageBox MB_OK|MB_ICONEXCLAMATION "Setup could not copy the original profile. You can retry using the migration script."
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend
