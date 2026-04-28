const WebSocket = require("ws");

let wss = null;
const clients = new Set();

function log(...args) {
  console.log("[SA-BRIDGE]", ...args);
}

function startStreamAvatarsBridge(port = 8765) {
  if (wss) {
    log(`ya estaba iniciado en puerto ${port}`);
    return wss;
  }

  wss = new WebSocket.Server({ port });

  wss.on("connection", (ws, req) => {
    const ip = req?.socket?.remoteAddress || "unknown";
    log(`cliente conectado desde ${ip}`);
    clients.add(ws);

    ws.on("close", () => {
      clients.delete(ws);
      log("cliente desconectado");
    });

    ws.on("error", (err) => {
      log("error en cliente WS:", err?.message || err);
    });

    ws.on("message", (msg) => {
      log("mensaje desde Stream Avatars:", String(msg || ""));
    });
  });

  wss.on("listening", () => {
    log(`escuchando en ws://127.0.0.1:${port}`);
  });

  wss.on("error", (err) => {
    log("error del servidor WS:", err?.message || err);
  });

  return wss;
}

function stopStreamAvatarsBridge() {
  if (!wss) return;

  for (const ws of clients) {
    try {
      ws.close();
    } catch {}
  }

  clients.clear();

  try {
    wss.close();
  } catch {}

  wss = null;
  log("bridge detenido");
}

function normalizeUserId(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^\w\-]/g, "") || "usuario";
}

function safeString(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function sendToStreamAvatars(obj) {
  const json = JSON.stringify(obj);

  if (!clients.size) {
    log("sin clientes conectados, evento descartado:", json);
    return;
  }

  let sent = 0;

  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(json);
        sent += 1;
      } catch (err) {
        log("error enviando evento:", err?.message || err);
      }
    }
  }

  log(`evento enviado a ${sent} cliente(s):`, json);
}

function mapGiftAmount(payload) {
  const count = Number(payload.count || 1);
  if (Number.isFinite(count) && count > 0) return count;
  return 1;
}

function transformCommandPrefix(message) {
  if (!message) return message;

  if (message.startsWith(".")) {
    return "!" + message.slice(1);
  }

  if (message.startsWith("!")) {
    return message;
  }

  return message;
}

function handleDigoEvent(payload) {
  if (!payload || !payload.type) return;

  const type = safeString(payload.type).toLowerCase();
  const userName = safeString(payload.user, "Usuario").trim() || "Usuario";
  const userId = normalizeUserId(userName);

  log("evento recibido desde Digo:", payload);

  if (type === "chat") {
    let message = safeString(payload.text).trim();
    if (!message) return;

    message = transformCommandPrefix(message);

    sendToStreamAvatars({
      type: "chat",
      userId,
      userName,
      message
    });
    return;
  }

  if (type === "command") {
    const cmd = safeString(payload.command).trim();
    const args = safeString(payload.args).trim();

    let message = `${cmd}${args ? " " + args : ""}`.trim();
    if (!message) return;

    message = transformCommandPrefix(message);

    sendToStreamAvatars({
      type: "chat",
      userId,
      userName,
      message
    });
    return;
  }

  if (type === "gift") {
    const amount = mapGiftAmount(payload);

    sendToStreamAvatars({
      type: "gift",
      userId,
      userName,
      amount,
      lifetime: amount,
      giftName: safeString(payload.giftName || payload.gift, "")
    });
    return;
  }

  if (type === "fan") {
    sendToStreamAvatars({
      type: "follow",
      userId,
      userName
    });
    return;
  }

  if (type === "share") {
    sendToStreamAvatars({
      type: "chat",
      userId,
      userName,
      message: "!share"
    });
    return;
  }

  log("tipo no mapeado a Stream Avatars:", type);
}

module.exports = {
  startStreamAvatarsBridge,
  stopStreamAvatarsBridge,
  handleDigoEvent
};