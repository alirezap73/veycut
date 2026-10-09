; VeyCut's Windows installer.
;
; Built by build-app.yml with Inno Setup from the staged folder the .msi
; is also made of, so the two ship the same files; this is the one a
; person double-clicks, and it puts VeyCut in the Start menu and can take
; it out again. Everything it needs is handed in on the command line:
;
;   iscc /DVersion=0.1.0 /DArch=x64compatible /DSuffix=x86_64 ^
;        /DStage=C:\...\stage\VeyCut-0.1.0-windows-x86_64 /DOut=C:\...\stage ^
;        assets\windows\concat.iss
;
; Arch is Inno's own word for the machine: x64compatible for the x86_64
; build (which also installs on ARM PCs, under emulation), arm64 for the
; native one. Suffix is the bundle's word for it, which names the file.

#ifndef Version
  #error Version is required
#endif
#ifndef Arch
  #error Arch is required: x64compatible or arm64
#endif
#ifndef Suffix
  #error Suffix is required: x86_64 or aarch64
#endif
#ifndef Stage
  #error Stage is required: the staged folder to install
#endif
#ifndef Out
  #define Out "."
#endif

[Setup]
; One id for the life of the product, so an install over an older one is
; an upgrade and not a second copy.
AppId={{AE7027E1-DF59-4D24-BE37-4F38C69D970F}
AppName=VeyCut
AppVersion={#Version}
AppVerName=VeyCut {#Version}
AppPublisher=VeyCut contributors
AppPublisherURL=https://github.com/alirezap73/veycut
AppSupportURL=https://github.com/alirezap73/veycut/issues
AppUpdatesURL=https://github.com/alirezap73/veycut/releases
DefaultDirName={autopf}\VeyCut
DefaultGroupName=VeyCut
DisableProgramGroupPage=yes
LicenseFile=..\..\LICENSE
OutputDir={#Out}
OutputBaseFilename=VeyCut-{#Version}-windows-{#Suffix}-setup
SetupIconFile=..\icons\concat.ico
UninstallDisplayIcon={app}\concat.ico
UninstallDisplayName=VeyCut
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed={#Arch}
ArchitecturesInstallIn64BitMode={#Arch}
; For the user alone unless they ask for the machine: no prompt for an
; administrator to install a video editor into one's own account.
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
; Follow Windows' display language when the setup speaks it, and ask only
; when it does not.
ShowLanguageDialog=auto

[Languages]
; The app's languages that Inno Setup ships an official translation for.
; Chinese, Persian, Croatian and Korean are not among them, and a setup in
; those asks which language to use.
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "german"; MessagesFile: "compiler:Languages\German.isl"
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"
Name: "french"; MessagesFile: "compiler:Languages\French.isl"
Name: "italian"; MessagesFile: "compiler:Languages\Italian.isl"
Name: "japanese"; MessagesFile: "compiler:Languages\Japanese.isl"
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"
Name: "russian"; MessagesFile: "compiler:Languages\Russian.isl"
Name: "turkish"; MessagesFile: "compiler:Languages\Turkish.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "{#Stage}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\icons\concat.ico"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\VeyCut"; Filename: "{app}\concat.exe"; IconFilename: "{app}\concat.ico"
Name: "{autodesktop}\VeyCut"; Filename: "{app}\concat.exe"; IconFilename: "{app}\concat.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\concat.exe"; Description: "{cm:LaunchProgram,VeyCut}"; Flags: nowait postinstall skipifsilent
