console.log("[🎁 DigoPC Gifts CORE READY v6 JSON NAME BY ICON]");

(() => {
  const digoAPI = window.digoAPI || null;

  const state = {
    enabled: true,
    useCustomJson: false,
    customJsonText: "",
    defaultJsonPath: "./regalos.json",

    giftMap: {},
    catalogByIcon: new Map(),
    catalogByName: new Map(),
    jsonMetaByIcon: new Map(),

    queue: [],
    processingQueue: false,
    currentQueueAudio: null,

    audioCache: new Map(),
    previewAudios: new Set(),

    seen: new Map(),
    maxSeen: 300,
    dedupeMs: 2500,

    maxQueue: 20
  };

  function logDigo(texto) {
    try {
      digoAPI?.sendLogFromPage?.(String(texto));
    } catch {
      console.log("[DigoPC][Gifts]", texto);
    }
  }

  function emitirEvento(payload) {
    try {
      digoAPI?.sendEventFromPage?.(payload);
    } catch {
      console.log("[DigoPC][Gifts event fallback]", payload);
    }
  }

  function now() {
    return Date.now();
  }

  function text(v) {
    return String(v || "").trim();
  }

  function toNum(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function clampVolume(v) {
    return Math.max(0, Math.min(1, toNum(v, 1)));
  }

  function normalizeGiftName(v) {
    return text(v).replace(/\s+/g, " ");
  }

  function normalizeTextLoose(v) {
    return String(v || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
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

  function rebuildGiftCatalogIndexes() {
    state.catalogByIcon = new Map();
    state.catalogByName = new Map();

    const catalog =
      window.NEBULA_GIFTS_LATAM ||
      window.NEBULA_GIFTS ||
      window.NEBULA_GIFTS_CATALOG ||
      null;

    const rawList = Array.isArray(catalog)
      ? catalog
      : (Array.isArray(catalog?.data) ? catalog.data : []);

    for (const item of rawList) {
      const name = text(item?.name || item?.gift_name || item?.title || "");
      const icon = normalizeImageUrl(item?.icon || item?.image || item?.gift_icon || "");
      const coins = toNum(item?.coins ?? item?.diamond_count ?? item?.price ?? 0, 0);

      if (icon) {
        state.catalogByIcon.set(icon, {
          ...item,
          name,
          icon,
          coins
        });
      }

      if (name) {
        state.catalogByName.set(normalizeTextLoose(name), {
          ...item,
          name,
          icon,
          coins
        });
      }
    }

    logDigo(`[GIFTS] Índices de catálogo: icon=${state.catalogByIcon.size} name=${state.catalogByName.size}`);
  }

  function rebuildJsonMetaByIcon() {
    state.jsonMetaByIcon = new Map();

    for (const [jsonName, soundUrl] of Object.entries(state.giftMap)) {
      const loose = normalizeTextLoose(jsonName);
      const catalogItem = state.catalogByName.get(loose);

      if (!catalogItem) continue;

      const icon = normalizeImageUrl(catalogItem.icon || "");
      const coins = toNum(catalogItem.coins, 0);

      if (!icon) continue;

      state.jsonMetaByIcon.set(icon, {
        jsonName,
        soundUrl,
        icon,
        coins
      });
    }

    logDigo(`[GIFTS] Índices JSON por icono: ${state.jsonMetaByIcon.size}`);
  }

  function getStoredConfig() {
    try {
      const raw = localStorage.getItem("digo_config");
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function saveStoredConfig(nextCfg) {
    try {
      localStorage.setItem("digo_config", JSON.stringify(nextCfg));
      return true;
    } catch {
      return false;
    }
  }

  function getGiftsConfig() {
    const cfg = getStoredConfig();
    const gifts = cfg.gifts || {};

    return {
      enabled: gifts.enabled !== false,
      useCustomJson: gifts.useCustomJson === true,
      customJsonText: typeof gifts.customJsonText === "string" ? gifts.customJsonText : "",
      defaultJsonPath: gifts.defaultJsonPath || "./regalos.json"
    };
  }

  function saveGiftsConfig(patch = {}) {
    const cfg = getStoredConfig();
    cfg.gifts = {
      ...(cfg.gifts || {}),
      ...patch
    };
    return saveStoredConfig(cfg);
  }

  function cargarConfiguracion() {
    const cfg = getGiftsConfig();
    state.enabled = !!cfg.enabled;
    state.useCustomJson = !!cfg.useCustomJson;
    state.customJsonText = cfg.customJsonText || "";
    state.defaultJsonPath = cfg.defaultJsonPath || "./regalos.json";

    logDigo(
      `[GIFTS] Config cargada. activo=${state.enabled} custom=${state.useCustomJson} path=${state.defaultJsonPath}`
    );
  }

  function isValidJsonObject(texto) {
    try {
      const parsed = JSON.parse(texto);
      return !!parsed && typeof parsed === "object" && !Array.isArray(parsed);
    } catch {
      return false;
    }
  }

  function normalizarMapaRegalos(obj) {
    const out = {};
    if (!obj || typeof obj !== "object") return out;

    for (const [giftName, soundUrl] of Object.entries(obj)) {
      const k = normalizeGiftName(giftName);
      const v = text(soundUrl);
      if (!k || !v) continue;
      out[k] = v;
    }

    return out;
  }

  async function cargarRegalos() {
  cargarConfiguracion();
  rebuildGiftCatalogIndexes();

  try {
    const res = await fetch(state.defaultJsonPath);
    const internalData = await res.json();
    const internalGiftMap = normalizarMapaRegalos(internalData);

    let source = "internal";
    let finalGiftMap = internalGiftMap;

    if (state.useCustomJson && state.customJsonText) {
      if (isValidJsonObject(state.customJsonText)) {
        const customGiftMap = normalizarMapaRegalos(
          JSON.parse(state.customJsonText)
        );

        finalGiftMap = {
          ...internalGiftMap,
          ...customGiftMap,
        };

        source = "internal+custom";
      } else {
        logDigo("[GIFTS] JSON custom inválido. Se ignora.");
      }
    }

    state.giftMap = finalGiftMap;
    rebuildJsonMetaByIcon();

    logDigo(
      `[GIFTS] JSON activo: ${source} (${Object.keys(state.giftMap).length} regalos)`
    );

    emitirEvento({
      type: "gifts_json_loaded",
      source,
      count: Object.keys(state.giftMap).length,
      ts: now(),
    });

    preloadAudios();
    return true;
  } catch (e) {
    state.giftMap = {};
    state.jsonMetaByIcon = new Map();

    logDigo(`[GIFTS] No se pudo cargar JSON: ${e.message}`);

    emitirEvento({
      type: "gifts_json_error",
      message: e.message,
      ts: now(),
    });

    return false;
  }
}

  function getAudio(url) {
    const safeUrl = text(url);
    if (!safeUrl) return null;

    let audio = state.audioCache.get(safeUrl);
    if (!audio) {
      audio = new Audio(safeUrl);
      audio.preload = "auto";
      state.audioCache.set(safeUrl, audio);
    }
    return audio;
  }

  function preloadAudios() {
    Object.values(state.giftMap).forEach((url) => {
      if (text(url)) getAudio(url);
    });
  }

  function cleanupSeen() {
    const ts = now();

    for (const [key, value] of state.seen.entries()) {
      if (!value || (ts - value.ts) > state.dedupeMs) {
        state.seen.delete(key);
      }
    }

    if (state.seen.size <= state.maxSeen) return;

    const entries = Array.from(state.seen.entries()).sort((a, b) => {
      return (a[1]?.ts || 0) - (b[1]?.ts || 0);
    });

    while (entries.length > state.maxSeen) {
      const item = entries.shift();
      if (item) state.seen.delete(item[0]);
    }
  }

  function makeEventKey(ev) {
    const type = text(ev?.type).toLowerCase();
    if (type !== "gift") return "";

    const gift = normalizeGiftName(ev?.gift || ev?.giftName || "");
    const icon = normalizeImageUrl(ev?.giftIcon || ev?.icon || "");
    const user = text(ev?.user || ev?.username || "unknown").toLowerCase();
    const count = toNum(ev?.count ?? ev?.repeatCount ?? 1, 1);
    const tsBucket = Math.floor(toNum(ev?.ts, 0) / 500);

    return [type, gift, icon, user, count, tsBucket].join("|");
  }

  function isDuplicate(ev) {
    cleanupSeen();
    const key = makeEventKey(ev);
    if (!key) return false;

    const hit = state.seen.get(key);
    const ts = now();

    if (hit && (ts - hit.ts) <= state.dedupeMs) {
      return true;
    }

    state.seen.set(key, { ts });
    return false;
  }

  function stopAllPreviews() {
    if (!state.previewAudios.size) return;

    for (const audio of state.previewAudios) {
      try {
        audio.pause();
        audio.currentTime = 0;
        audio.src = "";
        audio.removeAttribute("src");
        audio.load();
      } catch {}
    }

    state.previewAudios.clear();
  }

  async function playPreviewUrl(url, volume = 1) {
    const safeUrl = text(url);
    if (!safeUrl) return false;

    stopAllPreviews();

    const audio = new Audio(safeUrl);
    audio.preload = "auto";
    audio.volume = clampVolume(volume);
    audio.loop = false;

    state.previewAudios.add(audio);

    const cleanup = () => {
      state.previewAudios.delete(audio);
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {}
      try {
        audio.src = "";
        audio.removeAttribute("src");
        audio.load();
      } catch {}
    };

    audio.addEventListener("ended", cleanup, { once: true });
    audio.addEventListener("error", cleanup, { once: true });

    try {
      await audio.play();
      return true;
    } catch (err) {
      cleanup();
      console.error("[GIFTS] preview play error", err);
      return false;
    }
  }

  function enqueueSound(url, meta = {}) {
    if (!state.enabled) return false;
    if (!text(url)) return false;

    if (state.queue.length >= state.maxQueue) {
      logDigo("[GIFTS] Cola llena. Se ignora sonido.");
      return false;
    }

    state.queue.push({
      url: text(url),
      volume: clampVolume(meta.volume ?? 1),
      gift: normalizeGiftName(meta.gift || ""),
      user: text(meta.user || "unknown"),
      ts: now()
    });

    processQueue();
    return true;
  }

  async function processQueue() {
    if (state.processingQueue) return;
    state.processingQueue = true;

    try {
      while (state.queue.length) {
        const item = state.queue.shift();
        if (!item?.url) continue;

        const audio = getAudio(item.url);
        if (!audio) continue;

        state.currentQueueAudio = audio;

        try {
          audio.pause();
          audio.currentTime = 0;
          audio.volume = clampVolume(item.volume);
        } catch {}

        await new Promise((resolve) => {
          let settled = false;

          const done = () => {
            if (settled) return;
            settled = true;
            audio.removeEventListener("ended", done);
            audio.removeEventListener("error", done);
            if (state.currentQueueAudio === audio) {
              state.currentQueueAudio = null;
            }
            resolve();
          };

          audio.addEventListener("ended", done, { once: true });
          audio.addEventListener("error", done, { once: true });

          audio.play().catch((err) => {
            console.error("[GIFTS] queue play error", err);
            done();
          });
        });
      }
    } finally {
      state.processingQueue = false;
      state.currentQueueAudio = null;
    }
  }

  function clearQueue() {
    state.queue = [];

    if (state.currentQueueAudio) {
      try {
        state.currentQueueAudio.pause();
        state.currentQueueAudio.currentTime = 0;
      } catch {}
    }

    state.currentQueueAudio = null;
    state.processingQueue = false;
  }

  function findSoundUrlForGift(giftName, giftIcon) {
    const normalizedName = normalizeTextLoose(giftName);
    const normalizedIcon = normalizeImageUrl(giftIcon);

    // 1) prioridad total: si el icono coincide con una entrada del JSON, usamos ESE nombre del JSON
    if (normalizedIcon && state.jsonMetaByIcon.has(normalizedIcon)) {
      const jsonMeta = state.jsonMetaByIcon.get(normalizedIcon);
      return {
        soundUrl: jsonMeta.soundUrl,
        resolvedName: jsonMeta.jsonName,
        resolvedIcon: jsonMeta.icon,
        resolvedCoins: jsonMeta.coins,
        via: "icon->json-meta"
      };
    }

    // 2) fallback por catálogo exacto
    if (normalizedIcon && state.catalogByIcon.has(normalizedIcon)) {
      const catalogItem = state.catalogByIcon.get(normalizedIcon);
      const officialName = text(catalogItem?.name || catalogItem?.gift_name || "");
      const officialIcon = normalizeImageUrl(catalogItem?.icon || catalogItem?.image || catalogItem?.gift_icon || "");
      const officialCoins = toNum(catalogItem?.coins ?? catalogItem?.diamond_count ?? catalogItem?.price ?? 0, 0);

      if (officialName && state.giftMap[officialName]) {
        return {
          soundUrl: state.giftMap[officialName],
          resolvedName: officialName,
          resolvedIcon: officialIcon || normalizedIcon,
          resolvedCoins: officialCoins,
          via: "icon->catalog->exact-name"
        };
      }

      const officialLoose = normalizeTextLoose(officialName);
      for (const [jsonName, url] of Object.entries(state.giftMap)) {
        if (normalizeTextLoose(jsonName) === officialLoose) {
          return {
            soundUrl: url,
            resolvedName: jsonName,
            resolvedIcon: officialIcon || normalizedIcon,
            resolvedCoins: officialCoins,
            via: "icon->catalog->normalized-name"
          };
        }
      }
    }

    // 3) exact name
    if (giftName && state.giftMap[normalizeGiftName(giftName)]) {
      const lookup = state.catalogByName.get(normalizeTextLoose(giftName));
      return {
        soundUrl: state.giftMap[normalizeGiftName(giftName)],
        resolvedName: normalizeGiftName(giftName),
        resolvedIcon: normalizeImageUrl(lookup?.icon || giftIcon || ""),
        resolvedCoins: toNum(lookup?.coins, 0),
        via: "exact-name"
      };
    }

    // 4) normalized name
    for (const [jsonName, url] of Object.entries(state.giftMap)) {
      if (normalizeTextLoose(jsonName) === normalizedName) {
        const lookup = state.catalogByName.get(normalizedName);
        return {
          soundUrl: url,
          resolvedName: jsonName,
          resolvedIcon: normalizeImageUrl(lookup?.icon || giftIcon || ""),
          resolvedCoins: toNum(lookup?.coins, 0),
          via: "normalized-name"
        };
      }
    }

    return {
      soundUrl: "",
      resolvedName: giftName || "",
      resolvedIcon: normalizeImageUrl(giftIcon || ""),
      resolvedCoins: 0,
      via: "unmapped"
    };
  }

  function procesarRegalo(nombreRegalo, cantidad = 1, usuario = "unknown", raw = "", giftIcon = "", ev = null) {
    if (!state.enabled) return false;
    if (!nombreRegalo && !giftIcon) return false;

    const match = findSoundUrlForGift(nombreRegalo, giftIcon);
    const soundUrl = match.soundUrl;
    const resolvedGiftName = match.resolvedName || normalizeGiftName(nombreRegalo);
    const resolvedGiftIcon = match.resolvedIcon || normalizeImageUrl(giftIcon || "");
    const resolvedCoins = toNum(match.resolvedCoins, 0);

    if (!soundUrl) {
      logDigo(`[GIFTS] Regalo sin sonido configurado: ${nombreRegalo} | icon=${giftIcon || "-"}`);

      emitirEvento({
        type: "gift_unmapped",
        user: usuario,
        gift: nombreRegalo,
        giftName: nombreRegalo,
        giftIcon: normalizeImageUrl(giftIcon || ""),
        icon: normalizeImageUrl(giftIcon || ""),
        originalGiftName: nombreRegalo,
        count: cantidad,
        coins: 0,
        giftMeta: {
          name: nombreRegalo,
          icon: normalizeImageUrl(giftIcon || ""),
          coins: 0
        },
        raw,
        ts: now()
      });

      return false;
    }

    if (ev && isDuplicate(ev)) {
      logDigo(`[GIFTS] Duplicado ignorado: ${usuario} -> ${resolvedGiftName} x${cantidad}`);
      return false;
    }

    const veces = Math.max(1, Math.min(toNum(cantidad, 1), 20));

    for (let i = 0; i < veces; i++) {
      enqueueSound(soundUrl, {
        gift: resolvedGiftName,
        user: usuario,
        volume: 1
      });
    }

    logDigo(`[GIFT] ${usuario} -> ${resolvedGiftName} x${veces} [${match.via}]`);

    emitirEvento({
      type: "gift_played",
      user: usuario,
      gift: resolvedGiftName,
      giftName: resolvedGiftName,
      giftIcon: resolvedGiftIcon,
      icon: resolvedGiftIcon,
      originalGiftName: nombreRegalo,
      count: veces,
      coins: resolvedCoins,
      giftMeta: {
        name: resolvedGiftName,
        icon: resolvedGiftIcon,
        coins: resolvedCoins
      },
      raw,
      ts: now()
    });

    return true;
  }

  function handleCoreEvent(ev) {
    if (!ev || typeof ev !== "object") return false;
    if (String(ev.type || "").toLowerCase() !== "gift") return false;

    return procesarRegalo(
      ev.gift || ev.giftName || "",
      ev.count || ev.repeatCount || 1,
      ev.user || ev.username || "unknown",
      ev.raw || "",
      ev.giftIcon || ev.icon || "",
      ev
    );
  }

  async function setCustomJsonText(jsonText) {
    if (!jsonText || !isValidJsonObject(jsonText)) {
      logDigo("[GIFTS] El JSON custom recibido no es válido.");
      return { ok: false, error: "JSON inválido" };
    }

    saveGiftsConfig({
      useCustomJson: true,
      customJsonText: jsonText
    });

    await cargarRegalos();
    return { ok: true };
  }

  async function useInternalJson() {
    saveGiftsConfig({
      useCustomJson: false,
      customJsonText: ""
    });

    await cargarRegalos();
    return { ok: true };
  }

  function setEnabled(value) {
    state.enabled = !!value;
    saveGiftsConfig({ enabled: state.enabled });

    if (!state.enabled) {
      clearQueue();
      stopAllPreviews();
    }

    logDigo(`[GIFTS] ${state.enabled ? "Activado" : "Desactivado"}`);
    return state.enabled;
  }

  function getStatus() {
    return {
      enabled: state.enabled,
      useCustomJson: state.useCustomJson,
      loadedCount: Object.keys(state.giftMap || {}).length,
      queueSize: state.queue.length,
      cachedAudios: state.audioCache.size,
      catalogIconSize: state.catalogByIcon.size,
      jsonMetaIconSize: state.jsonMetaByIcon.size
    };
  }

  async function reloadConfig() {
    cargarConfiguracion();
    return cargarRegalos();
  }

  window.DigoGifts = {
    processEvent: handleCoreEvent,
    processGift: procesarRegalo,
    reloadConfig,
    setEnabled,
    setCustomJsonText,
    useInternalJson,
    getStatus,
    clearQueue,
    stopAllPreviews,
    playPreviewUrl,
    getGiftMap: () => ({ ...state.giftMap })
  };

  window.addEventListener("message", async (event) => {
    const data = event?.data;
    if (!data || typeof data !== "object") return;

    if (data.type === "DIGO_CORE_EVENT" && data.payload) {
      handleCoreEvent(data.payload);
      return;
    }

    if (data.type === "DIGO_UPDATE_GIFTS_CONFIG") {
      try {
        const patch = data.payload || {};
        saveGiftsConfig(patch);

        if (typeof patch.enabled !== "undefined") {
          state.enabled = !!patch.enabled;
          if (!state.enabled) {
            clearQueue();
            stopAllPreviews();
          }
        }

        await reloadConfig();
      } catch {}
      return;
    }

    if (data.type === "DIGO_SET_GIFTS_CUSTOM_JSON" && typeof data.payload?.text === "string") {
      await setCustomJsonText(data.payload.text);
      return;
    }

    if (data.type === "DIGO_USE_INTERNAL_GIFTS_JSON") {
      await useInternalJson();
      return;
    }
  });

  cargarRegalos().then(() => {
    logDigo("[GIFTS] Módulo listo con prioridad de nombre del JSON por icono.");
  });
})();