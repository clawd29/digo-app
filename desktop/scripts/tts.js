console.log("[🔊 DigoPC TTS FULL READY v6]");

(() => {
  let config = {
    ttsActivo: true,
    vozSeleccionada: null,
    rate: 1.0,
    pitch: 1.0,
    volume: 1.0,

    leerChats: true,
    leerShares: true,
    leerRegalos: false,
    leerSistema: true,

    cooldownMs: 5000,
    maxQueue: 30,
    duckMientrasHabla: true
  };

  const blockedPhrases = [
    "became a fan",
    "won't miss the next live",
    "sent a",
    "sent...",
    "sent ",
    "dado que la distinción",
    "loaded:",
    "loading",
    "[page]",
    "[load]",
    "[ok]",
    "[error]",
    "core + módulos inyectados",
    "iniciando carga del live",
    "página cargada"
  ];

  const cooldownTts = new Map();
  const queue = [];
  let speaking = false;
  let ducking = false;

  function log(msg) {
    console.log(msg);
  }

  function safeText(v) {
    return String(v || "").replace(/\s+/g, " ").trim();
  }

  function quitarEmojis(texto) {
    try {
      return String(texto || "").replace(/\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu, "");
    } catch {
      return String(texto || "");
    }
  }

  function normalizarUsuario(user) {
    let raw = safeText(String(user || ""));

    // Caso tipo "ID: 1116500082 :" o variantes
    if (/^id\s*:\s*\d+/i.test(raw)) {
      return "numeritos";
    }

    let limpio = safeText(
      raw
        .replace(/\bLv\.?\s*\d+\b/gi, "")
        .replace(/^\d+\s*/, "")
        .replace(/[⚡️🐾🌸💕⭐💎🔥✨🖥️🎖️🏅👑💫]+/g, "")
        .replace(/[^\p{L}\p{N}\s._:-]/gu, "")
        .replace(/\s*:\s*$/, "")
    );

    if (/^id\s*:/i.test(limpio)) {
      return "numeritos";
    }

    return limpio;
  }

  function limpiarTexto(texto) {
    return safeText(
      String(texto || "")
        .replace(/\bLv\.?\s*\d+\b/gi, "")
        .replace(/\bsent\b/gi, "")
        .replace(/\benvió\b/gi, "")
        .replace(/\benvio\b/gi, "")
        .replace(/:\s*$/, "")
    );
  }

  function isSpamLike(msg) {
    const s0 = safeText(msg);
    if (s0.length < 6) return false;

    const s = s0.replace(/\s+/g, "");
    if (s.length < 6) return false;

    if ([...s].every(ch => ch === s[0])) return true;
    if (/^_+$/.test(s) && s.length >= 5) return true;
    if (/^([a-zA-Z]{1,3})\1{2,}$/i.test(s)) return true;

    const counts = {};
    for (const ch of s) counts[ch] = (counts[ch] || 0) + 1;
    const maxFreq = Math.max(...Object.values(counts));
    if (maxFreq / s.length >= 0.8) return true;

    return false;
  }

  function isGiftLikeMessage(msg) {
    const lower = safeText(msg).toLowerCase();

    if (!lower) return false;
    if (lower === "sent") return true;
    if (lower.startsWith("sent ")) return true;
    if (lower.includes("sent a")) return true;
    if (lower.includes(" envió ")) return true;
    if (lower.startsWith("envió ")) return true;
    if (lower.includes("enviado")) return true;
    if (lower.includes("gift")) return true;

    return false;
  }

  function isSystemNoise(msg) {
    const lower = safeText(msg).toLowerCase();

    if (!lower) return true;

    if (/^loaded:\s*\d+%$/i.test(lower)) return true;
    if (/^loading[:\s]/i.test(lower)) return true;
    if (/^\[\s*(page|load|ok|error)\s*\]/i.test(lower)) return true;
    if (/^\d+%$/.test(lower)) return true;
    if (lower.includes("iniciando carga del live")) return true;
    if (lower.includes("core + módulos inyectados")) return true;
    if (lower.includes("página cargada")) return true;

    return false;
  }

  function passesFilters(user, msg) {
    const m = safeText(msg);
    if (!m) return false;
    if (m.startsWith("!")) return false;
    if (isSpamLike(m)) return false;
    if (isGiftLikeMessage(m)) return false;
    if (isSystemNoise(m)) return false;

    const lower = m.toLowerCase();
    if (blockedPhrases.some(x => lower.includes(x))) return false;

    return true;
  }

  function cooldownOk(user) {
    const now = Date.now();
    const key = normalizarUsuario(quitarEmojis(user)).toLowerCase();
    const last = cooldownTts.get(key) || 0;
    if (now - last < Number(config.cooldownMs || 5000)) return false;
    cooldownTts.set(key, now);
    return true;
  }

  function getVoice() {
    const voices = speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return null;

    if (config.vozSeleccionada) {
      const found = voices.find(v => v.name === config.vozSeleccionada);
      if (found) return found;
    }

    const preferred = voices.find(v =>
      String(v.lang || "").toLowerCase().startsWith("es")
    );

    return preferred || voices[0];
  }

  function emitDuckStart() {
    if (!config.duckMientrasHabla || ducking) return;
    ducking = true;

    try {
      window.dispatchEvent(new CustomEvent("digo:tts-duck-start"));
    } catch {}

    try {
      window.parent?.postMessage({ type: "DIGO_TTS_DUCK", active: true }, "*");
    } catch {}
  }

  function emitDuckEnd() {
    if (!ducking) return;
    ducking = false;

    try {
      window.dispatchEvent(new CustomEvent("digo:tts-duck-end"));
    } catch {}

    try {
      window.parent?.postMessage({ type: "DIGO_TTS_DUCK", active: false }, "*");
    } catch {}
  }

  function speakNow(item) {
    if (!config.ttsActivo) {
      speaking = false;
      emitDuckEnd();
      processQueue();
      return;
    }

    const usuarioLimpio = normalizarUsuario(quitarEmojis(item.user || ""));
    const textoLimpio = limpiarTexto(quitarEmojis(item.text || ""));

    if (!textoLimpio || isSystemNoise(textoLimpio)) {
      speaking = false;
      emitDuckEnd();
      processQueue();
      return;
    }

    const finalText = usuarioLimpio
      ? `${usuarioLimpio}: ${textoLimpio}`
      : textoLimpio;

    const utter = new SpeechSynthesisUtterance(finalText);
    const voice = getVoice();
    if (voice) utter.voice = voice;

    utter.rate = Number(config.rate || 1.0);
    utter.pitch = Number(config.pitch || 1.0);
    utter.volume = Number(config.volume || 1.0);

    utter.onstart = () => {
      emitDuckStart();
      log(`[🗣️ TTS START] ${finalText}`);
    };

    utter.onend = () => {
      speaking = false;
      emitDuckEnd();
      processQueue();
    };

    utter.onerror = () => {
      speaking = false;
      emitDuckEnd();
      processQueue();
    };

    try {
      speechSynthesis.speak(utter);
    } catch (err) {
      console.error("[TTS] Error speaking:", err);
      speaking = false;
      emitDuckEnd();
      processQueue();
    }
  }

  function processQueue() {
    if (speaking) return;
    if (!queue.length) return;

    const next = queue.shift();
    speaking = true;
    speakNow(next);
  }

  function enqueueSpeech(user, text) {
    if (!config.ttsActivo) return;

    if (queue.length >= Number(config.maxQueue || 30)) {
      queue.shift();
    }

    queue.push({ user, text });
    processQueue();
  }

  function hablar(user, text) {
    const usuarioLimpio = normalizarUsuario(quitarEmojis(user));
    const textoLimpio = limpiarTexto(quitarEmojis(text));

    if (!textoLimpio) return;
    if (isGiftLikeMessage(textoLimpio)) return;
    if (isSystemNoise(textoLimpio)) return;

    enqueueSpeech(usuarioLimpio, textoLimpio);
  }

  function hablarSistema(text) {
    const limpio = limpiarTexto(quitarEmojis(text));
    if (!limpio) return;
    if (isGiftLikeMessage(limpio)) return;
    if (isSystemNoise(limpio)) return;
    if (!passesFilters("", limpio)) return;

    enqueueSpeech("", limpio);
  }

  function handleChatEvent(ev) {
    if (!config.leerChats) return;

    const user = ev.user || ev.username || "Usuario";
    const text = ev.text || ev.message || "";

    const texto = limpiarTexto(quitarEmojis(text));
    if (!passesFilters(user, texto)) return;
    if (!cooldownOk(user)) return;

    hablar(user, texto);
  }

  function handleShareEvent(ev) {
    if (!config.leerShares) return;

    const user = ev.user || ev.username || "Usuario";
    if (!cooldownOk(user)) return;

    hablar(user, "Gracias por compartir");
  }

  function handleGiftEvent(ev) {
    return;
  }

  function handleSystemEvent(ev) {
    if (!config.leerSistema) return;

    const text =
      ev.text ||
      ev.message ||
      ev.msg ||
      "";

    if (!text) return;
    if (isSystemNoise(text)) return;

    hablarSistema(text);
  }

  function handleEvent(ev) {
    if (!ev || typeof ev !== "object") return;

    const type = String(ev.type || "").toLowerCase();

    if (type === "chat") {
      handleChatEvent(ev);
      return;
    }

    if (type === "share") {
      handleShareEvent(ev);
      return;
    }

    if (type === "gift") {
      handleGiftEvent(ev);
      return;
    }

    if (type === "fan") {
      return;
    }

    if (type === "system") {
      handleSystemEvent(ev);
      return;
    }
  }

  function saveConfig() {
    try {
      localStorage.setItem("digo_tts_config", JSON.stringify(config));
    } catch {}
  }

  function loadConfig() {
    try {
      const saved = localStorage.getItem("digo_tts_config");
      if (saved) {
        config = { ...config, ...JSON.parse(saved) };
      }
    } catch {}
  }

  window.addEventListener("message", (e) => {
    if (e.data?.type === "DIGO_CORE_EVENT") {
      handleEvent(e.data.payload);
      return;
    }

    if (e.data?.type === "DIGO_UPDATE_TTS_CONFIG") {
      config = {
        ...config,
        ...(e.data.payload || {})
      };
      saveConfig();
      log(`[TTS] Config actualizada. activo=${config.ttsActivo}`);
      return;
    }

    if (e.data?.type === "DIGO_TTS_SPEAK_SYSTEM") {
      hablarSistema(e.data.text || "");
      return;
    }

    if (e.data?.type === "DIGO_TTS_STOP") {
      try {
        queue.length = 0;
        speechSynthesis.cancel();
      } catch {}
      speaking = false;
      emitDuckEnd();
    }
  });

  speechSynthesis.onvoiceschanged = () => {
    log("[TTS] Voces actualizadas");
  };

  loadConfig();
  log("[TTS] Módulo listo");
})();