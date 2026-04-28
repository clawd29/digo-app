const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");
const { ElectronBlocker } = require("@ghostery/adblocker-electron");
const fetch = require("cross-fetch");

const {
  startStreamAvatarsBridge,
  stopStreamAvatarsBridge,
  handleDigoEvent
} = require("./streamavatars-bridge");

let mainWindow = null;
let hiddenWindow = null;
let playerWindow = null;
let playerBlockerReady = null;
let widgetServer = null;

let giftMatrix = [];
let giftById = new Map();
let giftByName = new Map();

let lastPlayerUiState = {
  current: null,
  queue: [],
  playing: false,
  ducking: false,
  ts: Date.now()
};

const isDev = !app.isPackaged;
const RENDERER_DEV_URL = "http://localhost:5173";

function sendLog(msg) {
  mainWindow?.webContents.send("log", msg);
}

function sendLiveEvent(payload) {
  if (payload?.type === "player_ui") {
    lastPlayerUiState = {
      current: payload.current || null,
      queue: Array.isArray(payload.queue) ? payload.queue : [],
      playing: !!payload.playing,
      ducking: !!payload.ducking,
      ts: payload.ts || Date.now()
    };
  }

  mainWindow?.webContents.send("live-event", payload);
}

function sendPlayerState(payload) {
  sendLiveEvent({
    type: "player_state",
    ...payload
  });
}

function normalizeText(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

async function ensurePlayerBlocker(session) {
  if (!playerBlockerReady) {
    playerBlockerReady = ElectronBlocker.fromPrebuiltAdsAndTracking(fetch);
  }

  try {
    const blocker = await playerBlockerReady;
    blocker.enableBlockingInSession(session);
    sendLog("[PLAYER] Adblock activo en la ventana del player.");
  } catch (err) {
    sendLog(`[PLAYER] No se pudo activar adblock: ${err.message}`);
  }
}

function loadGiftMatrix() {
  try {
    const giftsPath = path.join(__dirname, "gifts.json");

    if (!fs.existsSync(giftsPath)) {
      sendLog(`[GIFTS] gifts.json no encontrado en ${giftsPath}`);
      giftMatrix = [];
      giftById = new Map();
      giftByName = new Map();
      return;
    }

    const raw = fs.readFileSync(giftsPath, "utf8");
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      sendLog("[GIFTS] gifts.json no es un array válido.");
      giftMatrix = [];
      giftById = new Map();
      giftByName = new Map();
      return;
    }

    giftMatrix = parsed;
    giftById = new Map();
    giftByName = new Map();

    for (const gift of giftMatrix) {
      if (gift?.giftId != null) {
        giftById.set(Number(gift.giftId), gift);
      }

      if (gift?.name) {
        giftByName.set(normalizeText(gift.name), gift);
      }
    }

    sendLog(`[GIFTS] Matriz cargada: ${giftMatrix.length} regalos.`);
  } catch (err) {
    console.error("[GIFTS] Error leyendo gifts.json:", err);
    sendLog(`[GIFTS] Error leyendo gifts.json: ${err.message}`);
    giftMatrix = [];
    giftById = new Map();
    giftByName = new Map();
  }
}

function findGiftMeta(payload) {
  if (!payload || typeof payload !== "object") return null;

  const possibleId = payload.giftId ?? payload.id ?? null;
  if (possibleId != null && !Number.isNaN(Number(possibleId))) {
    const byId = giftById.get(Number(possibleId));
    if (byId) return byId;
  }

  const possibleNames = [
    payload.gift,
    payload.giftName,
    payload.name,
    payload.text
  ]
    .map((v) => String(v || "").trim())
    .filter(Boolean);

  for (const name of possibleNames) {
    const normalized = normalizeText(name);

    if (giftByName.has(normalized)) {
      return giftByName.get(normalized);
    }

    for (const [savedName, gift] of giftByName.entries()) {
      if (savedName === normalized) return gift;
      if (savedName.includes(normalized) || normalized.includes(savedName)) return gift;
    }
  }

  return null;
}

function enrichLiveEvent(payload) {
  if (!payload || typeof payload !== "object") return payload;
  if (payload.type !== "gift") return payload;

  const meta = findGiftMeta(payload);
  if (!meta) return payload;

  return {
    ...payload,
    giftId: payload.giftId ?? meta.giftId ?? null,
    giftName: payload.gift || payload.giftName || meta.name || "Regalo",
    gift: payload.gift || payload.giftName || meta.name || "Regalo",
    icon: payload.icon || meta.icon || "",
    giftIcon: payload.giftIcon || meta.icon || "",
    coins: Number(meta.coins || 0),
    giftMeta: {
      giftId: meta.giftId ?? null,
      name: meta.name || "",
      icon: meta.icon || "",
      coins: Number(meta.coins || 0),
      type: meta.type ?? null,
      area: meta.area || ""
    }
  };
}

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    backgroundColor: "#0f1720",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    await mainWindow.loadURL(RENDERER_DEV_URL);
  } else {
    const indexPath = path.join(__dirname, "..", "..", "renderer", "dist", "index.html");
    await mainWindow.loadFile(indexPath);
  }
}

async function injectAllScripts() {
  if (!hiddenWindow || hiddenWindow.isDestroyed()) return;

  const scriptsDir = path.join(__dirname, "..", "scripts");

  const contentCode = fs.readFileSync(path.join(scriptsDir, "content.js"), "utf8");
  const ttsCode = fs.readFileSync(path.join(scriptsDir, "tts.js"), "utf8");
  const giftsCode = fs.readFileSync(path.join(scriptsDir, "gifts.js"), "utf8");
  const ytmusicCode = fs.readFileSync(path.join(scriptsDir, "ytmusic.js"), "utf8");

  await hiddenWindow.webContents.executeJavaScript(contentCode);
  await hiddenWindow.webContents.executeJavaScript(ttsCode);
  await hiddenWindow.webContents.executeJavaScript(giftsCode);
  await hiddenWindow.webContents.executeJavaScript(ytmusicCode);
}

function createHiddenWindow(url) {
  if (hiddenWindow && !hiddenWindow.isDestroyed()) {
    hiddenWindow.close();
    hiddenWindow = null;
  }

  hiddenWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  hiddenWindow.on("closed", () => {
    hiddenWindow = null;
    sendLog("[LOAD] Ventana oculta cerrada.");
  });

  hiddenWindow.webContents.on("did-start-loading", () => {
    sendLog("[LOAD] Iniciando carga del live...");
  });

  hiddenWindow.webContents.on("did-finish-load", async () => {
    try {
      if (!hiddenWindow || hiddenWindow.isDestroyed()) return;

      const currentUrl = hiddenWindow.webContents.getURL();
      sendLog(`[LOAD] Página cargada: ${currentUrl}`);

      await injectAllScripts();
      sendLog("[OK] Core + módulos inyectados.");
    } catch (err) {
      sendLog(`[ERROR] Inyección falló: ${err.message}`);
    }
  });

  hiddenWindow.webContents.on("console-message", (_, __, message) => {
    sendLog(`[PAGE] ${message}`);
  });

  hiddenWindow.webContents.on("did-fail-load", (_, code, desc, validatedURL) => {
    sendLog(`[ERROR] did-fail-load ${code}: ${desc} (${validatedURL})`);
  });

  hiddenWindow.loadURL(url);
}

async function createPlayerWindow(initialUrl = "https://www.youtube.com/") {
  if (playerWindow && !playerWindow.isDestroyed()) {
    return playerWindow;
  }

  playerWindow = new BrowserWindow({
    width: 520,
    height: 380,
    autoHideMenuBar: true,
    backgroundColor: "#0b1220",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  await ensurePlayerBlocker(playerWindow.webContents.session);

  playerWindow.on("closed", () => {
    playerWindow = null;
    sendPlayerState({
      status: "cerrado",
      url: "",
      title: ""
    });
  });

  playerWindow.webContents.on("page-title-updated", (event, title) => {
    event.preventDefault();
    sendPlayerState({
      status: "abierto",
      url: playerWindow?.webContents.getURL() || "",
      title: title || ""
    });
  });

  playerWindow.webContents.on("did-finish-load", () => {
    sendPlayerState({
      status: "abierto",
      url: playerWindow?.webContents.getURL() || "",
      title: ""
    });
  });

  await playerWindow.loadURL(initialUrl);
  return playerWindow;
}

async function ensurePlayerTarget(url) {
  const win = await createPlayerWindow(url);

  if (!win || win.isDestroyed()) {
    return { ok: false, error: "No se pudo crear player" };
  }

  try {
    if (win.webContents.getURL() !== url) {
      await win.loadURL(url);
    }

    win.show();
    win.focus();

    sendLog(`[PLAYER] Reutilizando ventana: ${url}`);
    sendPlayerState({
      status: "abierto",
      url,
      title: ""
    });

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function buildPlayerUrl({ videoId, startSeconds = 0, useMusic = false }) {
  const base = useMusic
    ? "https://music.youtube.com/watch?v="
    : "https://www.youtube.com/watch?v=";

  return `${base}${encodeURIComponent(videoId)}${startSeconds ? `&t=${startSeconds}` : ""}`;
}

async function postToHiddenWindow(message) {
  if (!hiddenWindow || hiddenWindow.isDestroyed()) {
    return { ok: false, error: "No hay live conectado" };
  }

  try {
    await hiddenWindow.webContents.executeJavaScript(`
      window.postMessage(${JSON.stringify(message)}, "*");
    `);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function getWidgetMime(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js") return "application/javascript; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".svg") return "image/svg+xml";
  return "text/plain; charset=utf-8";
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": getWidgetMime(filePath) });
    res.end(data);
  });
}

function startWidgetServer(port = 3030) {
  if (widgetServer) return;

  const publicDir = path.join(__dirname, "..", "..", "renderer", "public");

  widgetServer = http.createServer((req, res) => {
    const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);

    if (url.pathname === "/player-state.json") {
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
        "Access-Control-Allow-Origin": "*"
      });
      res.end(JSON.stringify(lastPlayerUiState));
      return;
    }

    if (url.pathname === "/player-widget") {
      serveFile(res, path.join(publicDir, "player-widget.html"));
      return;
    }

    if (url.pathname === "/player-widget.css") {
      serveFile(res, path.join(publicDir, "player-widget.css"));
      return;
    }

    if (url.pathname === "/player-widget.js") {
      serveFile(res, path.join(publicDir, "player-widget.js"));
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  });

  widgetServer.listen(port, "127.0.0.1", () => {
    sendLog(`[WIDGET] Disponible en http://127.0.0.1:${port}/player-widget`);
  });
}

function stopWidgetServer() {
  if (!widgetServer) return;
  try {
    widgetServer.close();
  } catch {}
  widgetServer = null;
}

app.whenReady().then(async () => {

  startStreamAvatarsBridge(8765);

  loadGiftMatrix();
  await createMainWindow();
  startWidgetServer(3030);

  ipcMain.handle("connect-live", async (_, url) => {
    try {
      loadGiftMatrix();
      createHiddenWindow(url);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle("disconnect-live", async () => {
    try {
      if (hiddenWindow && !hiddenWindow.isDestroyed()) {
        hiddenWindow.close();
      }

      hiddenWindow = null;
      sendLog("[OK] Live desconectado.");
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle("open-player-home", async (_, useMusic = false) => {
    try {
      const url = useMusic ? "https://music.youtube.com/" : "https://www.youtube.com/";
      return await ensurePlayerTarget(url);
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle("play-in-player", async (_, payload) => {
    try {
      if (!payload?.videoId) {
        return { ok: false, error: "Falta videoId" };
      }

      const url = buildPlayerUrl(payload);
      return await ensurePlayerTarget(url);
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle("close-player", async () => {
    try {
      if (playerWindow && !playerWindow.isDestroyed()) {
        playerWindow.close();
      }
      playerWindow = null;
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle("player-next", async () => {
    return await postToHiddenWindow({ type: "DIGO_YT_SKIP" });
  });

  ipcMain.handle("player-stop", async () => {
    return await postToHiddenWindow({ type: "DIGO_YT_STOP" });
  });

  ipcMain.handle("player-open", async () => {
    try {
      return await ensurePlayerTarget("https://www.youtube.com/");
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

ipcMain.on("event-from-page", (_, payload) => {
  const enriched = enrichLiveEvent(payload);
  sendLiveEvent(enriched);

  try {
    handleDigoEvent(enriched);
  } catch (err) {
    sendLog(`[WS] Error enviando evento a Stream Avatars: ${err.message}`);
  }
});

  ipcMain.on("log-from-page", (_, text) => {
    mainWindow?.webContents.send("log", text);
  });

  ipcMain.handle("set-tts-config", async (_, config) => {
    if (!hiddenWindow) return { ok: false, error: "No hay live conectado" };

    try {
      await hiddenWindow.webContents.executeJavaScript(`
        localStorage.setItem("digo_tts_config", JSON.stringify(${JSON.stringify(config)}));
        window.postMessage({ type: "DIGO_UPDATE_TTS_CONFIG", payload: ${JSON.stringify(config)} }, "*");
      `);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle("set-gifts-config", async (_, config) => {
    if (!hiddenWindow) return { ok: false, error: "No hay live conectado" };

    try {
      await hiddenWindow.webContents.executeJavaScript(`
        window.postMessage({
          type: "DIGO_UPDATE_GIFTS_CONFIG",
          payload: ${JSON.stringify(config)}
        }, "*");
      `);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle("pick-gift-json", async () => {
    const res = await dialog.showOpenDialog({
      filters: [{ name: "JSON", extensions: ["json"] }],
      properties: ["openFile"]
    });

    if (res.canceled || !res.filePaths[0]) return null;

    const content = fs.readFileSync(res.filePaths[0], "utf8");
    return content;
  });
});

app.on("before-quit", () => {
  stopWidgetServer();        // lo que ya tenías
  stopStreamAvatarsBridge(); // 👈 nuevo
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});