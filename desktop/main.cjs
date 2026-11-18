/*
 * Clyro para computador.
 *
 * O app carrega o próprio site do Clyro (o mesmo deploy do Lovable), então
 * toda atualização do site chega no app sem reinstalar. O que o app acrescenta
 * é o que o navegador não deixa um site fazer:
 *
 * - não congela quando a janela fica atrás de outra (jogo, editor, tela cheia):
 *   o navegador segura timers, quadros e o processamento de uma aba em segundo
 *   plano, e é daí que vem boa parte do atraso e dos cortes na call;
 * - o macOS não põe o app em App Nap no meio da call;
 * - som da call toca sem esperar clique (sem bloqueio de autoplay);
 * - microfone, câmera e tela liberados uma vez, sem pedido a cada visita;
 * - escolha de tela e janela própria, no lugar do seletor do navegador.
 */
const {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  ipcMain,
  powerSaveBlocker,
  session,
  shell,
  systemPreferences,
  nativeTheme,
} = require("electron");
const path = require("node:path");

const APP_URL = (process.env.CLYRO_URL || "https://clyro-chat-connect.lovable.app").replace(
  /\/+$/,
  "",
);
const APP_ORIGIN = new URL(APP_URL).origin;

/* Hosts do login social: abrem dentro do app, para a sessão voltar para ele. */
const AUTH_HOSTS = [
  "accounts.google.com",
  "appleid.apple.com",
  "login.microsoftonline.com",
  "lovable.dev",
  "lovable.app",
  "supabase.co",
];

function isAuthUrl(raw) {
  try {
    const host = new URL(raw).hostname;
    return AUTH_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

function isAppUrl(raw) {
  try {
    return new URL(raw).origin === APP_ORIGIN;
  } catch {
    return false;
  }
}

// Uma janela por vez: abrir o Clyro de novo traz a que já existe para a frente.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

/*
 * Chromium no modo de app de chamada: nada de segurar a página quando a janela
 * sai da frente, e áudio liberado sem gesto.
 */
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
// Sem o controle automático de volume do microfone no nível do sistema: o
// Clyro já tem o próprio ganho e a guarda de eco, e os dois brigariam.
app.commandLine.appendSwitch("disable-features", "WebRtcAllowInputVolumeAdjustment");
/*
 * Correção de perdas no vídeo (FlexFEC): junto da imagem vai um pouco de
 * redundância, e um pacote perdido é refeito na hora em vez de esperar o
 * reenvio ou um quadro-chave novo — é o que transformava uma perda na rede
 * numa tela travada. Vale entre dois apps; com quem está no navegador a
 * conexão segue como antes.
 */
app.commandLine.appendSwitch(
  "force-fieldtrials",
  "WebRTC-FlexFEC-03-Advertised/Enabled/WebRTC-FlexFEC-03/Enabled/",
);

/** @type {BrowserWindow | null} */
let mainWindow = null;
let pickCounter = 0;
/** @type {Map<string, (sourceId: string | null) => void>} */
const pendingPicks = new Map();

ipcMain.on("clyro:source-picked", (_event, requestId, sourceId) => {
  const resolve = pendingPicks.get(requestId);
  if (!resolve) return;
  pendingPicks.delete(requestId);
  resolve(typeof sourceId === "string" ? sourceId : null);
});

/**
 * No macOS compartilhar tela pede a permissão de Gravação de Tela. Sem ela, o
 * app explica e abre o lugar certo dos Ajustes, em vez de falhar calado.
 */
async function ensureScreenAccess(win) {
  if (process.platform !== "darwin") return true;
  const status = systemPreferences.getMediaAccessStatus("screen");
  if (status === "granted") return true;
  const { response } = await dialog.showMessageBox(win, {
    type: "info",
    buttons: ["Abrir Ajustes", "Agora não"],
    defaultId: 0,
    cancelId: 1,
    message: "Libere o Clyro para compartilhar a tela",
    detail:
      "Em Ajustes do Sistema › Privacidade e Segurança › Gravação de Tela, ative o Clyro. Depois feche e abra o app de novo.",
  });
  if (response === 0) {
    void shell.openExternal(
      "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
    );
  }
  return false;
}

function setupSession() {
  const ses = session.defaultSession;

  // O Google recusa login em "navegador embutido": o app se apresenta como o
  // Chrome que ele é por baixo.
  ses.setUserAgent(
    ses.getUserAgent().replace(new RegExp(`\\s?(Electron|${app.getName()})/\\S+`, "gi"), ""),
  );

  const allowed = new Set([
    "media",
    "display-capture",
    "notifications",
    "clipboard-read",
    "clipboard-sanitized-write",
    "fullscreen",
    "speaker-selection",
  ]);
  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    const origin = details.requestingUrl || wc.getURL();
    callback(isAppUrl(origin) && allowed.has(permission));
  });
  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin) => {
    return isAppUrl(requestingOrigin) && allowed.has(permission);
  });

  /*
   * O site chama `getDisplayMedia` como sempre; aqui o app lista telas e
   * janelas e o site mostra o seletor do Clyro. O som da tela fica de fora: no
   * computador ele levaria junto a voz de todo mundo da call, e voltaria como
   * eco (o site faz o mesmo com a tela inteira no navegador).
   */
  ses.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      // Recusar: o Electron rejeita o pedido do site e ainda lança aqui; o
      // `getDisplayMedia` do site recebe o erro e trata como "cancelou".
      const deny = () => {
        try {
          callback({});
        } catch {
          /* pedido recusado */
        }
      };
      const win = mainWindow;
      if (!win) return deny();
      if (!(await ensureScreenAccess(win))) return deny();
      try {
        const sources = await desktopCapturer.getSources({
          types: ["window", "screen"],
          thumbnailSize: { width: 480, height: 270 },
          fetchWindowIcons: true,
        });
        const ownId = win.getMediaSourceId();
        const visible = sources.filter((s) => s.id !== ownId && s.name !== "Clyro");
        const requestId = `pick-${++pickCounter}`;
        const chosenId = await new Promise((resolve) => {
          pendingPicks.set(requestId, resolve);
          win.webContents.send("clyro:pick-source", {
            requestId,
            sources: visible.map((s) => ({
              id: s.id,
              name: s.name,
              kind: s.id.startsWith("screen:") ? "screen" : "window",
              thumbnail: s.thumbnail.isEmpty() ? "" : s.thumbnail.toDataURL(),
              icon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : null,
            })),
          });
        });
        const source = visible.find((s) => s.id === chosenId);
        if (!source) return deny();
        callback({ video: source });
      } catch (error) {
        console.error("[clyro] screen picker failed", error);
        deny();
      }
    },
    { useSystemPicker: false },
  );
}

function createWindow() {
  const isMac = process.platform === "darwin";
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 840,
    // Abaixo disso o site troca para o layout de celular; o app fica sempre no de mesa.
    minWidth: 1040,
    minHeight: 640,
    show: false,
    title: "Clyro",
    icon: path.join(__dirname, "build", "icon.png"),
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#0b0b0c" : "#f5f5f5",
    autoHideMenuBar: true,
    ...(isMac ? { titleBarStyle: "hiddenInset", trafficLightPosition: { x: 14, y: 10 } } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // O principal: a call não desacelera com a janela atrás de outra.
      backgroundThrottling: false,
      spellcheck: true,
      additionalArguments: [`--clyro-version=${app.getVersion()}`],
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());

  const wc = mainWindow.webContents;

  // Links de fora abrem no navegador; o login social abre numa janela do app.
  wc.setWindowOpenHandler(({ url }) => {
    if (isAppUrl(url) || isAuthUrl(url)) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          width: 520,
          height: 720,
          autoHideMenuBar: true,
          parent: mainWindow ?? undefined,
          webPreferences: { sandbox: true, contextIsolation: true },
        },
      };
    }
    if (/^https?:/i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  wc.on("will-navigate", (event, url) => {
    if (isAppUrl(url) || isAuthUrl(url)) return;
    event.preventDefault();
    if (/^https?:/i.test(url)) void shell.openExternal(url);
  });

  void mainWindow.loadURL(`${APP_URL}/app`);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.whenReady().then(async () => {
  if (process.platform === "darwin") {
    // Pede o microfone ao macOS logo na abertura, e não no meio da primeira call.
    try {
      await systemPreferences.askForMediaAccess("microphone");
    } catch {
      /* a pessoa pode liberar depois nos Ajustes */
    }
  }
  // Sem App Nap: o macOS não reduz o app enquanto ele está atrás de outras janelas.
  powerSaveBlocker.start("prevent-app-suspension");

  setupSession();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
