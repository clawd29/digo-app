console.log("[🎵 YTMusic MODULAR v7 UI bridge + ducking listo]");
console.log("[🔥 YTMusic cargado]");

(() => {
  const digoAPI = window.digoAPI || null;

  let videoActual = null;
  let cola = [];
  let reproduciendo = false;
  let timerActual = null;
  let ultimoInfoAt = 0;

  let duckActivo = false;
  let duckRestoreTimer = null;

  const MAX_COLA = 5;
  const COOLDOWN_MS = 120000;
  const INFO_COOLDOWN_MS = 2500;
  const DUCK_MS = 2200;
  const cooldownUsuarios = {};

  function log(texto) {
    try { digoAPI?.sendLogFromPage?.(`[YT] ${texto}`); } catch {}
    console.log(`[YT] ${texto}`);
  }

  function emitir(ev) {
    try { digoAPI?.sendEventFromPage?.(ev); } catch {}
  }

 function emitUiState() {
  emitir({
    type: "player_ui",
    current: videoActual
      ? {
          videoId: videoActual.videoId,
          nombre: videoActual.nombre,
          duration: videoActual.duration,
          requestedBy: videoActual.requestedBy || "Usuario",
          thumbnail: `https://img.youtube.com/vi/${videoActual.videoId}/hqdefault.jpg`
        }
      : null,
    queue: cola.map((item) => ({
      videoId: item.videoId,
      nombre: item.nombre,
      duration: item.duration,
      requestedBy: item.requestedBy || "Usuario",
      thumbnail: `https://img.youtube.com/vi/${item.videoId}/hqdefault.jpg`
    })),
    playing: reproduciendo,
    ducking: duckActivo,
    ts: Date.now()
  });
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
    let limpio = safeText(
      String(user || "")
        .replace(/\bLv\.?\s*\d+\b/gi, "")
        .replace(/^\d+\s*/, "")
        .replace(/[⚡️🐾🌸💕⭐💎🔥✨🖥️🎖️🏅👑💫]+/g, "")
    );
    if (/^id\s*:/i.test(limpio)) return "numeritos";
    return limpio;
  }

  function enviarMensajeChat(mensaje) {
    const textarea = document.querySelector(".user_sent_msg textarea");
    const boton = document.querySelector(".user_sent_msg .send_btn");
    if (textarea && boton) {
      textarea.value = mensaje;
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      boton.click();
    }
  }

  function speakInfo(texto) {
    const now = Date.now();
    if (now - ultimoInfoAt < INFO_COOLDOWN_MS) return;
    ultimoInfoAt = now;
    try {
      window.postMessage({ type: "DIGO_TTS_SPEAK_SYSTEM", text: texto }, "*");
    } catch {}
  }

  function resumenCola() {
    if (!cola.length) return "La cola está vacía.";
    const max = Math.min(cola.length, 5);
    const partes = [];
    for (let i = 0; i < max; i++) partes.push(`${i + 1}. ${cola[i].nombre || cola[i].videoId}`);
    const extra = cola.length > max ? ` y ${cola.length - max} más` : "";
    return `En cola: ${partes.join(" | ")}${extra}`;
  }

  function limpiarTimerActual() {
    if (timerActual) {
      clearTimeout(timerActual);
      timerActual = null;
    }
  }

  function clearDuckTimer() {
    if (duckRestoreTimer) {
      clearTimeout(duckRestoreTimer);
      duckRestoreTimer = null;
    }
  }

  function detenerActual(motivo = "stop") {
    limpiarTimerActual();
    clearDuckTimer();
    reproduciendo = false;
    duckActivo = false;
    videoActual = null;

    try {
      emitir({ type: "player_stop", reason: motivo, ts: Date.now() });
    } catch {}

    emitUiState();
  }

  async function buscarVideo(query) {
    try {
      const r = await fetch(`https://digoplugin.online/search?q=${encodeURIComponent(query)}`);
      const data = await r.json();
      if (!data?.videoId) return null;

      return {
        videoId: data.videoId,
        nombre: data.title || query,
        duration: parseInt(data.duration || "150", 10) || 150,
        queryOriginal: query
      };
    } catch {
      return null;
    }
  }

  function programarFin(video) {
    limpiarTimerActual();
    const durationMs = Math.max(1, Number(video.duration || 150)) * 1000;
    timerActual = setTimeout(() => {
      log(`Finalizó ${video.nombre}`);
      reproduciendo = false;
      videoActual = null;
      emitUiState();
      siguiente();
    }, durationMs);
  }

  function activarDuckTemporal() {
    if (!reproduciendo || !videoActual) return;

    duckActivo = true;
    clearDuckTimer();
    emitUiState();

    try {
      emitir({
        type: "player_duck",
        active: true,
        ts: Date.now(),
        title: videoActual?.nombre || ""
      });
    } catch {}

    duckRestoreTimer = setTimeout(() => {
      duckActivo = false;
      emitUiState();

      try {
        emitir({
          type: "player_duck",
          active: false,
          ts: Date.now(),
          title: videoActual?.nombre || ""
        });
      } catch {}
    }, DUCK_MS);
  }

  async function reproducir(video) {
    if (!video?.videoId) return;

    videoActual = video;
    reproduciendo = true;
    duckActivo = false;

    emitir({
  type: "player_request",
  videoId: video.videoId,
  title: video.nombre,
  duration: video.duration,
  requestedBy: video.requestedBy || "Usuario",
  ts: Date.now()
});

    try {
      const res = await digoAPI?.playInPlayer?.({
        videoId: video.videoId,
        startSeconds: 0,
        useMusic: false
      });

      log(`playInPlayer -> ${JSON.stringify(res || null)}`);

      if (!res?.ok) {
        log(`No se pudo abrir player para ${video.videoId}`);
      }
    } catch (err) {
      log(`Error playInPlayer: ${err?.message || err}`);
    }

    enviarMensajeChat(`▶️ ${video.nombre}`);
    log(`Reproduciendo ${video.nombre}`);
    emitUiState();
    programarFin(video);
  }

  function siguiente() {
    if (reproduciendo) return;
    if (!cola.length) {
      emitUiState();
      return;
    }

    const next = cola.shift();
    emitUiState();
    reproducir(next);
  }

  async function handleCommand(ev) {
    const { command, args, user } = ev || {};
    if (!command) return false;
    if (window.ytMusicEnabled === false) return false;

    const nombre = normalizarUsuario(quitarEmojis(user || "Usuario"));
    const cmd = String(command).toLowerCase().trim();
    const argumentos = safeText(args);

    if (cmd === "!play") {
      if (!argumentos) return true;

      const now = Date.now();
     if (cooldownUsuarios[nombre] && now - cooldownUsuarios[nombre] < COOLDOWN_MS) {
  const restante = Math.ceil((COOLDOWN_MS - (now - cooldownUsuarios[nombre])) / 1000);

  enviarMensajeChat(`⏳ ${nombre}, estás en cooldown (${restante}s), pero se agregará a la cola.`);
  speakInfo(`${nombre}, puedes seguir agregando canciones a la cola.`);
      }

      if (cola.length >= MAX_COLA) {
        enviarMensajeChat("🚫 Cola llena.");
        speakInfo("La cola de canciones está llena.");
        return true;
      }

      enviarMensajeChat(`🔎 Buscando: ${argumentos}`);
      const video = await buscarVideo(argumentos);

if (!video) {
  enviarMensajeChat("❌ No encontrado.");
  speakInfo("No encontré esa canción.");
  return true;
}

video.requestedBy = nombre;

      cola.push(video);
      cooldownUsuarios[nombre] = Date.now();

      enviarMensajeChat(`✅ Añadido (#${cola.length}): ${video.nombre}`);
      log(`Añadido por ${nombre}: ${video.nombre}`);
      emitUiState();

      if (!reproduciendo) siguiente();
      return true;
    }

    if (cmd === "!queue") {
      if (!cola.length) {
        enviarMensajeChat("📭 Cola vacía.");
        speakInfo("La cola está vacía.");
      } else {
        const lista = cola.map((v, i) => `${i + 1}. ${v.nombre}`).join(" | ");
        enviarMensajeChat(`📀 ${lista}`);
        speakInfo(resumenCola());
      }
      return true;
    }

    if (cmd === "!song") {
      if (videoActual) {
        enviarMensajeChat(`🎶 ${videoActual.nombre}`);
        speakInfo(`Está sonando: ${videoActual.nombre}`);
      } else {
        enviarMensajeChat("⏸️ Nada reproduciendo.");
        speakInfo("No hay canción sonando.");
      }
      return true;
    }

    if (cmd === "!skip") {
      if (!videoActual) {
        enviarMensajeChat("⏭️ No hay canción activa.");
        return true;
      }
      enviarMensajeChat(`⏭️ Saltando: ${videoActual.nombre}`);
      detenerActual("skip");
      siguiente();
      return true;
    }

    if (cmd === "!stop") {
      cola = [];
      enviarMensajeChat("⏹️ Reproductor detenido.");
      detenerActual("stop");
      try {
        const res = await digoAPI?.closePlayer?.();
        log(`closePlayer -> ${JSON.stringify(res || null)}`);
      } catch (err) {
        log(`Error closePlayer: ${err?.message || err}`);
      }
      return true;
    }

    return false;
  }

  function parseChatAsCommand(ev) {
    const text = safeText(ev?.text || ev?.message || "");
    if (!text.startsWith("!")) return null;

    const parts = text.split(/\s+/);
    const command = (parts.shift() || "").toLowerCase();
    const args = parts.join(" ").trim();

    return {
      command,
      args,
      user: ev.user || ev.username || "Usuario"
    };
  }

  function handleEvent(ev) {
    if (!ev || typeof ev !== "object") return;

    if (ev.type === "command") {
      handleCommand(ev);
      return;
    }

    if (ev.type === "chat") {
      const parsed = parseChatAsCommand(ev);
      if (parsed) handleCommand(parsed);
      return;
    }

    if (ev.type === "player_state") {
      log(`Estado player: ${ev.status || "?"}`);
      return;
    }

    if (
      ev.type === "tts_start" ||
      ev.type === "duck_start" ||
      ev.type === "gift_played"
    ) {
      activarDuckTemporal();
      return;
    }
  }

  window.addEventListener("message", (event) => {
    const data = event?.data;
    if (!data) return;

    if (data.type === "DIGO_CORE_EVENT") {
      handleEvent(data.payload);
      return;
    }

    if (data.type === "DIGO_TTS_DUCK") {
      if (data.active) activarDuckTemporal();
      return;
    }

    if (data.type === "DIGO_YT_SET_ENABLED") {
      window.ytMusicEnabled = !!data.enabled;
      if (!window.ytMusicEnabled) {
        cola = [];
        detenerActual("disabled");
      }
      return;
    }

    if (data.type === "DIGO_YT_SKIP") {
      detenerActual("external_skip");
      siguiente();
      return;
    }

    if (data.type === "DIGO_YT_STOP") {
      cola = [];
      detenerActual("external_stop");
      digoAPI?.closePlayer?.();
    }
  });

  window.DigoPlayer = {
    processEvent: handleEvent,
    getState() {
      return {
        videoActual,
        cola: [...cola],
        reproduciendo,
        duckActivo
      };
    },
    skip() {
      detenerActual("api_skip");
      siguiente();
    },
    stop() {
      cola = [];
      detenerActual("api_stop");
      digoAPI?.closePlayer?.();
    }
  };

  emitUiState();
  log("YTMusic inicializado");
})();