-- Lance le serveur de la tête (`pnpm start --open`) quand OBS charge ce script, sans fenêtre de console.
-- `--open` ouvre aussi les réglages dans le navigateur par défaut, une fois le serveur prêt.
-- Le script n'arrête rien : le serveur s'arrête seul quand OBS se ferme ou ne revient pas en 30 s.
-- Sortie du serveur : server.log, à la racine du dépôt.
local obs = obslua
local ffi = require("ffi")

ffi.cdef([[
typedef void *HANDLE;
typedef unsigned long DWORD;
typedef int BOOL;
typedef struct _STARTUPINFOW {
  DWORD cb;
  wchar_t *lpReserved;
  wchar_t *lpDesktop;
  wchar_t *lpTitle;
  DWORD dwX;
  DWORD dwY;
  DWORD dwXSize;
  DWORD dwYSize;
  DWORD dwXCountChars;
  DWORD dwYCountChars;
  DWORD dwFillAttribute;
  DWORD dwFlags;
  unsigned short wShowWindow;
  unsigned short cbReserved2;
  unsigned char *lpReserved2;
  HANDLE hStdInput;
  HANDLE hStdOutput;
  HANDLE hStdError;
} STARTUPINFOW;
typedef struct _PROCESS_INFORMATION {
  HANDLE hProcess;
  HANDLE hThread;
  DWORD dwProcessId;
  DWORD dwThreadId;
} PROCESS_INFORMATION;
BOOL CreateProcessW(const wchar_t *lpApplicationName, wchar_t *lpCommandLine,
  void *lpProcessAttributes, void *lpThreadAttributes, BOOL bInheritHandles,
  DWORD dwCreationFlags, void *lpEnvironment, const wchar_t *lpCurrentDirectory,
  STARTUPINFOW *lpStartupInfo, PROCESS_INFORMATION *lpProcessInformation);
BOOL CloseHandle(HANDLE hObject);
DWORD GetLastError(void);
int MultiByteToWideChar(unsigned int CodePage, DWORD dwFlags, const char *lpMultiByteStr,
  int cbMultiByte, wchar_t *lpWideCharStr, int cchWideChar);
]])

local CP_UTF8 = 65001
local CREATE_NO_WINDOW = 0x08000000
local STARTF_USESHOWWINDOW = 0x00000001
local SW_HIDE = 0

local function toWide(text)
  local length = ffi.C.MultiByteToWideChar(CP_UTF8, 0, text, -1, nil, 0)
  local buffer = ffi.new("wchar_t[?]", length)
  ffi.C.MultiByteToWideChar(CP_UTF8, 0, text, -1, buffer, length)
  return buffer
end

-- script_path() rend le dossier de ce script (obs/) ; la racine du dépôt est son parent.
local function getRepositoryRoot()
  local folder = script_path():gsub("[/\\]+$", "")
  local root = folder:gsub("[/\\][^/\\]+$", "")
  return (root:gsub("/", "\\"))
end

local function startServer()
  local root = getRepositoryRoot()
  local shell = os.getenv("ComSpec") or "C:\\Windows\\System32\\cmd.exe"
  -- `/s /c "…"` : cmd retire les guillemets extérieurs. Le dossier courant évite tout chemin à guillemets (« projets perso »).
  local commandLine = toWide(string.format('"%s" /d /s /c "pnpm start --open >> server.log 2>&1"', shell))

  local startup = ffi.new("STARTUPINFOW")
  startup.cb = ffi.sizeof("STARTUPINFOW")
  startup.dwFlags = STARTF_USESHOWWINDOW
  startup.wShowWindow = SW_HIDE
  local process = ffi.new("PROCESS_INFORMATION")

  local isStarted = ffi.C.CreateProcessW(toWide(shell), commandLine, nil, nil, 0, CREATE_NO_WINDOW, nil, toWide(root), startup, process)
  if isStarted == 0 then
    obs.script_log(obs.LOG_WARNING, "Serveur de la tête non lancé, CreateProcessW a échoué (code " .. ffi.C.GetLastError() .. ")")
    return
  end
  ffi.C.CloseHandle(process.hProcess)
  ffi.C.CloseHandle(process.hThread)
  obs.script_log(obs.LOG_INFO, "Serveur de la tête lancé depuis " .. root .. " (journal : server.log)")
end

function script_description()
  return "Lance le serveur de la tête (pnpm start) au chargement du script, sans fenêtre, et ouvre les réglages dans le navigateur. Le serveur s'arrête seul quand OBS se ferme."
end

function script_load(settings)
  startServer()
end
