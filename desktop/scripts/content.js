console.log("[🔥 DigoPC content BRIDGE MODE v11 SINGLE INSTANCE FIX]");

(() => {
  if (window.__DIGO_CONTENT_BRIDGE_ACTIVE__) {
    console.log("[DigoPC] content.js ya estaba activo. Se evita reinyección duplicada.");
    return;
  }
  window.__DIGO_CONTENT_BRIDGE_ACTIVE__ = true;

  const digoAPI = window.digoAPI || null;

  const itemSignatures = new WeakMap();
  const seenEvents = new Map();

  const MAX_SEEN = 800;
  const DEDUPE_MS_CHAT = 1500;
  const DEDUPE_MS_COMMAND = 8000;
  const DEDUPE_MS_SHARE = 5000;
  const DEDUPE_MS_FAN = 5000;
  const DEDUPE_MS_GIFT = 1200;

  let chatRoot = null;
  let observer = null;
  let startupScanDone = false;

  const CHAT_ITEM_SELECTOR =
    ".chat-item-inner, .chat-item, [class*='chat-item-inner'], [class*='chat-item']";

  function now() {
    return Date.now();
  }

  function log(msg) {
    try {
      digoAPI?.sendLogFromPage?.(String(msg));
    } catch {}
    console.log(msg);
  }

  function emitir(payload) {
    try {
      digoAPI?.sendEventFromPage?.(payload);
      window.postMessage({ type: "DIGO_CORE_EVENT", payload }, "*");
    } catch {}
  }

  function limpiar(texto) {
    return String(texto || "").replace(/\s+/g, " ").trim();
  }

  function limpiarUsuario(user) {
    return String(user || "")
      .replace(/\bLv\.?\s*\d+\b/gi, "")
      .replace(/^\d+\s*/, "")
      .replace(/[⚡️🐾🌸💕⭐💎🔥✨🖥️🎖️🏅👑💫]+/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeText(text) {
    return limpiar(text)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function normalizeImageUrl(url) {
    const raw = String(url || "").trim();
    if (!raw) return "";

    try {
      const u = new URL(raw, location.href);
      return `${u.origin}${u.pathname}`;
    } catch {
      return raw.split("?")[0];
    }
  }

  function cleanupSeen() {
    const ts = now();

    for (const [key, value] of seenEvents.entries()) {
      if (!value || ts - value.ts > 30000) {
        seenEvents.delete(key);
      }
    }

    if (seenEvents.size <= MAX_SEEN) return;

    const entries = Array.from(seenEvents.entries()).sort(
      (a, b) => (a[1]?.ts || 0) - (b[1]?.ts || 0)
    );

    while (entries.length > MAX_SEEN) {
      const item = entries.shift();
      if (item) seenEvents.delete(item[0]);
    }
  }

  function isDuplicate(key, windowMs) {
    if (!key) return false;

    cleanupSeen();

    const ts = now();
    const hit = seenEvents.get(key);

    if (hit && ts - hit.ts <= windowMs) return true;

    seenEvents.set(key, { ts });
    return false;
  }

  function makeChatKey(user, msg) {
  const cleanUser = limpiarUsuario(user).toLowerCase();
  const cleanMsg = limpiar(msg)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s!?.,:;()-]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

  return `chat|${cleanUser}|${cleanMsg}`;
}

  function makeCommandKey(user, msg) {
    return `command|${limpiarUsuario(user).toLowerCase()}|${limpiar(msg).toLowerCase()}`;
  }

  function makeShareKey(user) {
    return `share|${limpiarUsuario(user).toLowerCase()}`;
  }

  function makeFanKey(user) {
    return `fan|${limpiarUsuario(user).toLowerCase()}`;
  }

  function makeGiftKey(user, gift, count, icon = "") {
    return `gift|${limpiarUsuario(user).toLowerCase()}|${limpiar(gift).toLowerCase()}|${Number(
      count || 1
    )}|${normalizeImageUrl(icon)}`;
  }

  function getChatRoot() {
    const selectors = [
      ".chat__container",
      '[class*="chat__container"]',
      ".chat-container",
      '[class*="chat-container"]',
      ".im-chat-room",
      '[class*="chatroom"]',
      '[class*="message-list"]',
      '[class*="live-chat"]',
      '[class*="chat-list"]',
      '[class*="room-chat"]',
      '[class*="msg-list"]'
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) {
        console.log("[DigoPC] Chat root encontrado:", selector);
        return el;
      }
    }

    const allDivs = Array.from(document.querySelectorAll("div"));
    for (const div of allDivs) {
      const text = div.innerText || "";
      if (text.includes(":") && text.length > 50) {
        console.log("[DigoPC] Chat root fallback usado");
        return div;
      }
    }

    return null;
  }

  function isChatItem(el) {
    return !!(el instanceof HTMLElement && el.matches?.(CHAT_ITEM_SELECTOR));
  }

  function isNestedChatItem(el) {
    if (!(el instanceof HTMLElement)) return false;
    return !!el.parentElement?.closest?.(CHAT_ITEM_SELECTOR);
  }

  function getChatItemsFrom(root) {
    if (!root) return [];
    return Array.from(root.querySelectorAll(CHAT_ITEM_SELECTOR)).filter(
      (el) => !isNestedChatItem(el)
    );
  }

  function findTextBySelectors(root, selectors) {
    for (const selector of selectors) {
      const el = root.querySelector(selector);
      const txt = limpiar(el?.textContent || el?.innerText || "");
      if (txt) return txt;
    }
    return "";
  }

  function extractUserAndMessage(item) {
    const user = limpiarUsuario(
      findTextBySelectors(item, [
        ".user-name",
        '[class*="user-name"]',
        ".nickname",
        '[class*="nickname"]',
        ".name",
        '[class*="name"]'
      ])
    );

    const msg = limpiar(
      findTextBySelectors(item, [
        ".user-text-content",
        '[class*="user-text-content"]',
        ".comment-text",
        '[class*="comment-text"]',
        ".text",
        '[class*="text"]',
        ".message",
        '[class*="message"]'
      ])
    );

    if (user && msg) return { user, msg };

    const raw = limpiar(item.innerText || "");
    if (!raw || !raw.includes(":")) return null;

    const parts = raw.split(":");
    if (parts.length < 2) return null;

    const parsedUser = limpiarUsuario(parts[0]);
    const parsedMsg = limpiar(parts.slice(1).join(":"));

    if (!parsedUser || !parsedMsg) return null;

    return { user: parsedUser, msg: parsedMsg };
  }

  function getItemSignature(item, parsed) {
    if (!item || !parsed) return "";
    return `${limpiarUsuario(parsed.user).toLowerCase()}|${limpiar(parsed.msg).toLowerCase()}`;
  }

  function alreadySeenSameSignature(item, signature) {
    const prev = itemSignatures.get(item) || "";
    if (prev && prev === signature) return true;
    itemSignatures.set(item, signature);
    return false;
  }

  function getElementAttr(el, names) {
    if (!el) return "";
    for (const name of names) {
      const value = limpiar(el.getAttribute?.(name) || "");
      if (value) return value;
    }
    return "";
  }

  function looksLikeSystemGiftText(msg) {
    const lower = normalizeText(msg);

    return (
      lower === "sent" ||
      lower.startsWith("sent ") ||
      lower.includes("sent a") ||
      lower === "envio" ||
      lower === "envió" ||
      lower.startsWith("envio ") ||
      lower.startsWith("envió ") ||
      lower.includes(" envio ") ||
      lower.includes(" envió ")
    );
  }

  function parseCountFromText(text) {
    const raw = limpiar(text);

    let m = raw.match(/\bx\s*(\d+)\b/i);
    if (m) return parseInt(m[1], 10);

    m = raw.match(/\b(\d+)\s*x\b/i);
    if (m) return parseInt(m[1], 10);

    m = raw.match(/\((\d+)\)/);
    if (m) return parseInt(m[1], 10);

    return 1;
  }

  function extractGiftFromText(msg) {
    const limpio = limpiar(msg);

    let match = limpio.match(/sent a\s+(.+?)(?:\s+x?(\d+))?$/i);
    if (match) {
      return {
        gift: limpiar(match[1]),
        count: parseInt(match[2] || "1", 10),
        icon: ""
      };
    }

    match = limpio.match(/envió\s+(.+?)(?:\s+x?(\d+))?$/i);
    if (match) {
      return {
        gift: limpiar(match[1]),
        count: parseInt(match[2] || "1", 10),
        icon: ""
      };
    }

    match = limpio.match(/envio\s+(.+?)(?:\s+x?(\d+))?$/i);
    if (match) {
      return {
        gift: limpiar(match[1]),
        count: parseInt(match[2] || "1", 10),
        icon: ""
      };
    }

    return null;
  }

  function pickBestGiftCandidate(candidates) {
    const filtered = candidates
      .map((c) => ({
        gift: limpiar(c.gift),
        count: Number(c.count || 1),
        icon: normalizeImageUrl(c.icon || "")
      }))
      .filter((c) => c.gift);

    if (!filtered.length) return null;

    filtered.sort((a, b) => {
      const aScore =
        (a.icon ? 3 : 0) +
        (a.gift.length > 2 ? 2 : 0) +
        (/sent|envio|envió/i.test(a.gift) ? -10 : 0);

      const bScore =
        (b.icon ? 3 : 0) +
        (b.gift.length > 2 ? 2 : 0) +
        (/sent|envio|envió/i.test(b.gift) ? -10 : 0);

      return bScore - aScore;
    });

    return filtered[0] || null;
  }

  function extractGiftFromDom(item, fallbackMsg = "") {
    if (!item) return null;

    const candidates = [];

    const images = Array.from(item.querySelectorAll("img"));
    for (const img of images) {
      const alt = limpiar(img.getAttribute("alt"));
      const title = limpiar(img.getAttribute("title"));
      const aria = limpiar(img.getAttribute("aria-label"));
      const src = normalizeImageUrl(img.getAttribute("src") || img.src || "");
      const count =
        parseInt(
          limpiar(
            img.getAttribute("data-count") ||
              img.getAttribute("data-num") ||
              img.getAttribute("data-repeat-count")
          ) || "1",
          10
        ) || 1;

      for (const label of [alt, title, aria]) {
        if (!label) continue;
        const norm = normalizeText(label);
        if (
          norm &&
          !norm.includes("avatar") &&
          !norm.includes("badge") &&
          !norm.includes("level") &&
          !norm.includes("fan")
        ) {
          candidates.push({
            gift: label,
            count,
            icon: src
          });
        }
      }
    }

    const allEls = Array.from(item.querySelectorAll("*"));
    for (const el of allEls) {
      const attrs = [
        "title",
        "aria-label",
        "data-name",
        "data-gift-name",
        "data-title",
        "data-desc",
        "data-text"
      ];

      const txt = getElementAttr(el, attrs);
      const src = normalizeImageUrl(el.getAttribute?.("src") || "");
      const count =
        parseInt(
          limpiar(
            el.getAttribute?.("data-count") ||
              el.getAttribute?.("data-num") ||
              el.getAttribute?.("data-repeat-count")
          ) || "1",
          10
        ) || 1;

      if (txt) {
        const norm = normalizeText(txt);
        if (
          norm &&
          !norm.includes("avatar") &&
          !norm.includes("badge") &&
          !norm.includes("level") &&
          !norm.includes("fan") &&
          !norm.includes("shared this live") &&
          !norm.includes("became a fan")
        ) {
          candidates.push({
            gift: txt,
            count,
            icon: src
          });
        }
      }
    }

    const raw = limpiar(item.innerText || "");
    const countFromRaw = parseCountFromText(raw || fallbackMsg);

    const textGift = extractGiftFromText(fallbackMsg) || extractGiftFromText(raw);
    if (textGift?.gift) {
      candidates.push({
        gift: textGift.gift,
        count: textGift.count || countFromRaw || 1,
        icon: textGift.icon || ""
      });
    }

    const best = pickBestGiftCandidate(candidates);
    if (!best) return null;

    return {
      gift: best.gift,
      count: best.count || countFromRaw || 1,
      icon: best.icon || ""
    };
  }

  function classifyAndEmit(user, msg, raw, item) {
    const cleanMsg = limpiar(msg);
    const lower = cleanMsg.toLowerCase();

    if (lower.includes("shared this live")) {
      if (isDuplicate(makeShareKey(user), DEDUPE_MS_SHARE)) return true;
      emitir({ type: "share", user, text: "Gracias por compartir", raw, ts: now() });
      return true;
    }

    if (lower.includes("became a fan")) {
      if (isDuplicate(makeFanKey(user), DEDUPE_MS_FAN)) return true;
      emitir({ type: "fan", user, text: "Bienvenido", raw, ts: now() });
      return true;
    }

    const giftFromText = extractGiftFromText(cleanMsg);
    if (giftFromText?.gift) {
      const giftIcon = extractGiftFromDom(item, cleanMsg)?.icon || "";
      if (
        isDuplicate(
          makeGiftKey(user, giftFromText.gift, giftFromText.count, giftIcon),
          DEDUPE_MS_GIFT
        )
      ) {
        return true;
      }

      emitir({
        type: "gift",
        user,
        gift: giftFromText.gift,
        giftName: giftFromText.gift,
        count: giftFromText.count,
        icon: giftIcon,
        giftIcon: giftIcon,
        text: `${giftFromText.gift} x${giftFromText.count}`,
        raw,
        ts: now()
      });
      return true;
    }

    if (looksLikeSystemGiftText(cleanMsg) || raw.toLowerCase().includes("sent")) {
      const domGift = extractGiftFromDom(item, cleanMsg);
      if (domGift?.gift) {
        if (
          isDuplicate(
            makeGiftKey(user, domGift.gift, domGift.count, domGift.icon),
            DEDUPE_MS_GIFT
          )
        ) {
          return true;
        }

        emitir({
          type: "gift",
          user,
          gift: domGift.gift,
          giftName: domGift.gift,
          count: domGift.count || 1,
          icon: domGift.icon || "",
          giftIcon: domGift.icon || "",
          text: `${domGift.gift} x${domGift.count || 1}`,
          raw,
          ts: now()
        });

        log(`[GIFT-DETECTED] ${user} -> ${domGift.gift} x${domGift.count || 1}`);
        return true;
      }
    }

    if (normalizeText(cleanMsg) === "sent") {
      return true;
    }

    if (cleanMsg.startsWith("!")) {
      const chatKey = makeChatKey(user, cleanMsg);

if (isDuplicate(chatKey, DEDUPE_MS_CHAT)) {
  return true;
}

emitir({
  type: "chat",
  user,
  text: cleanMsg,
  raw,
  ts: now()
});

return true;
    }

    if (isDuplicate(makeChatKey(user, cleanMsg), DEDUPE_MS_CHAT)) return true;

    emitir({
      type: "chat",
      user,
      text: cleanMsg,
      raw,
      ts: now()
    });

    return true;
  }

  function processChatItem(item, { startup = false } = {}) {
    if (!item || !(item instanceof HTMLElement)) return false;
    if (isNestedChatItem(item)) return false;

    const parsed = extractUserAndMessage(item);
    if (!parsed) return false;

    const signature = getItemSignature(item, parsed);
    if (!signature) return false;

    if (alreadySeenSameSignature(item, signature)) {
      return false;
    }

    if (startup) {
      return false;
    }

    const { user, msg } = parsed;
    const raw = limpiar(item.innerText || `${user}: ${msg}`);
    return classifyAndEmit(user, msg, raw, item);
  }

  function fullScan({ startup = false } = {}) {
    if (!chatRoot) return;
    getChatItemsFrom(chatRoot).forEach((item) => processChatItem(item, { startup }));
  }

  function observeChat() {
    if (!chatRoot) return;

    if (observer) {
      try {
        observer.disconnect();
      } catch {}
    }

    observer = new MutationObserver((mutations) => {
      const processed = new Set();

      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;

          if (isChatItem(node) && !isNestedChatItem(node)) {
            if (!processed.has(node)) {
              processed.add(node);
              processChatItem(node, { startup: false });
            }
            continue;
          }

          const nestedItems = getChatItemsFrom(node);
          if (nestedItems.length) {
            nestedItems.forEach((item) => {
              if (!processed.has(item)) {
                processed.add(item);
                processChatItem(item, { startup: false });
              }
            });
          }
        }
      }
    });

    observer.observe(chatRoot, { childList: true, subtree: true });
    log("[DigoPC] Observer del chat activo");
  }

  function boot() {
    const tryInit = () => {
      const root = getChatRoot();
      if (!root) {
        log("[DigoPC] Esperando contenedor de chat...");
        return false;
      }

      if (chatRoot !== root) {
        chatRoot = root;
        startupScanDone = false;
        log("[DigoPC] Contenedor de chat detectado");
      }

      if (!startupScanDone) {
        fullScan({ startup: true });
        startupScanDone = true;
        log("[DigoPC] Historial inicial marcado sin emitir");
      }

      observeChat();
      return true;
    };

    if (tryInit()) return;

    let retries = 0;
    const timer = setInterval(() => {
      retries += 1;
      if (tryInit() || retries >= 30) clearInterval(timer);
    }, 1000);
  }

  setTimeout(boot, 2500);
})();