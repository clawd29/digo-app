import { useEffect, useMemo, useState } from "react";
import Topbar from "../components/Topbar";
import ConnectCard from "../components/ConnectCard";
import TtsCard from "../components/TtsCard";
import GiftsCard from "../components/GiftsCard";
import EventsPanel from "../components/EventsPanel";
import PlayerPanel from "../components/PlayerPanel";
import LiveActionBanner from "../components/LiveActionBanner";
import RecentActivityPanel from "../components/RecentActivityPanel";
import { getElectronApi } from "../utils/electronApi";


function TopGiftersPanel({ giftFeed = [], events = [] }) {
  const giftsSource = giftFeed.length
    ? giftFeed
    : events.filter((event) => event.type === "gift" || event.type === "gift_unmapped");

  const topGifters = Object.values(
    giftsSource.reduce((acc, gift) => {
      const user = gift.user || "Usuario";
      const coins = Number(
          gift.total ||
          gift.coins ||
          gift.amount ||
          gift.giftMeta?.coins ||
          gift.count ||
          0
        );

      if (!acc[user]) {
        acc[user] = {
          user,
          total: 0,
          gifts: 0,
        };
      }

      acc[user].total += coins;
      acc[user].gifts += 1;

      return acc;
    }, {})
  )
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  return (
    <section className="card top-gifters-panel">
      <div className="top-gifters-header">
        <div>
          <div className="card-kicker">Ranking</div>
          <h3 className="top-gifters-title">Top 5 Gifters</h3>
        </div>

        <span className="top-gifters-badge">En vivo</span>
      </div>

      {topGifters.length === 0 ? (
        <div className="top-gifters-empty">Aún no hay regalos registrados</div>
      ) : (
        <div className="top-gifters-list">
          {topGifters.map((gifter, index) => (
            <div
            className={`top-gifter-item ${index === 0 ? "top-gifter-first" : ""}`}
            key={gifter.user}
          >
            <div className="top-gifter-avatar-wrap">
              <div className="top-gifter-crown">
                {index === 0 ? "👑" : `#${index + 1}`}
              </div>

              <div className="top-gifter-avatar">
                {(gifter.user || "U").charAt(0).toUpperCase()}
              </div>
            </div>

            <div className="top-gifter-info">
              <div className="top-gifter-name">{gifter.user}</div>

              <div className="top-gifter-badges">
                <span className="top-gifter-level">Lv {Math.min(99, gifter.gifts * 7)}</span>
                <span className="top-gifter-meta">{gifter.gifts} regalos</span>
              </div>
            </div>

            <div className="top-gifter-total">
              🟡 {gifter.total}
            </div>
          </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Dashboard() {
  const [liveId, setLiveId] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [voices, setVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState("");

  const [giftsEnabled, setGiftsEnabled] = useState(true);
  const [jsonLabel, setJsonLabel] = useState("JSON: regalos.json");

  const [events, setEvents] = useState([]);
  const [playerText, setPlayerText] = useState("Aquí irá el player");
  const [playerStatus, setPlayerStatus] = useState("idle");
  const [currentSongTitle, setCurrentSongTitle] = useState("");
  const [requestedBy, setRequestedBy] = useState("");
  const [playerQueue, setPlayerQueue] = useState([]);

  const [eventFilter, setEventFilter] = useState("system");
  const [liveAction, setLiveAction] = useState(null);

  const [thumbnail, setThumbnail] = useState("");

  const [currentVideoId, setCurrentVideoId] = useState("");

  const [actionsConfig, setActionsConfig] = useState({
    gift: true,
    share: true,
    fan: true,
    command: true,
  });

  const [latestGift, setLatestGift] = useState("");
  const [latestCommand, setLatestCommand] = useState("");
  const [latestShare, setLatestShare] = useState("");
  const [latestFan, setLatestFan] = useState("");

  // NUEVO: estado visual de regalos
  const [giftFeed, setGiftFeed] = useState([]);
  const [totalSeeds, setTotalSeeds] = useState(0);

  const isElectron = useMemo(() => {
    return !!getElectronApi();
  }, []);

  function triggerAction(action) {
    setLiveAction({
      id: Date.now(),
      ...action,
    });

    setTimeout(() => {
      setLiveAction(null);
    }, 3000);
  }

  function handleEventAction(event) {
    if (!event) return;

    if (event.raw?.type === "player_queue_update") {
      const queueFromEvent = Array.isArray(event.raw.queue)
        ? event.raw.queue.map((item) => ({
            id: `${item.videoId || item.title}-${Math.random()}`,
            title: item.title || "Sin título",
            user: item.user || "Usuario",
          }))
        : [];

      setPlayerQueue(queueFromEvent);

      if (event.raw.current) {
        setCurrentSongTitle(event.raw.current.title || "");
        setRequestedBy(event.raw.current.user || "");
        setPlayerStatus("playing");
      } else if (queueFromEvent.length === 0) {
        setCurrentSongTitle("");
        setRequestedBy("");
        setPlayerStatus("idle");
      }

      return;
    }

    if (event.type === "gift") {
      setLatestGift(event.text);

      if (actionsConfig.gift) {
        triggerAction({
          type: "gift",
          title: "Nuevo regalo",
          text: event.text,
        });
      }
      return;
    }

    if (event.type === "share") {
      setLatestShare(event.text);

      if (actionsConfig.share) {
        triggerAction({
          type: "share",
          title: "Live compartido",
          text: event.text,
        });
      }
      return;
    }

    if (event.type === "fan") {
      setLatestFan(event.text);

      if (actionsConfig.fan) {
        triggerAction({
          type: "fan",
          title: "Nuevo fan",
          text: event.text,
        });
      }
      return;
    }

    if (event.type === "command") {
      setLatestCommand(event.text);

      const rawText = String(event.text || "");
      const commandText = rawText
        .split(":")
        .slice(1)
        .join(":")
        .trim()
        .toLowerCase();

      const commandUser = event.user || rawText.split(":")[0]?.trim() || "Usuario";

      if (commandText.startsWith("!play")) {
        const query = commandText.replace("!play", "").trim();

        setPlayerStatus("loading");
        setPlayerText(query ? `Buscando: ${query}` : "Comando !play recibido");
        setCurrentSongTitle(query || "Buscando canción...");
        setRequestedBy(commandUser);
      }

      if (commandText.startsWith("!skip")) {
        setPlayerStatus("loading");
        setPlayerText("Saltando canción...");
      }

      if (commandText.startsWith("!stop")) {
        setPlayerStatus("stopped");
        setPlayerText("Reproductor detenido");
        setCurrentSongTitle("");
        setRequestedBy("");
      }

      if (actionsConfig.command) {
        triggerAction({
          type: "command",
          title: "Comando detectado",
          text: event.text,
        });
      }
      return;
    }

    if (event.raw?.type === "player_request") {
      setPlayerStatus("playing");
      setPlayerText(`Solicitando video: ${event.raw.videoId || "sin id"}`);
      setCurrentSongTitle(event.raw.title || event.text || "Canción en reproducción");

      if (event.user) {
        setRequestedBy(event.user);
      }

      return;
    }

    if (event.raw?.type === "player_pause") {
      setPlayerStatus("paused");
      setPlayerText("Reproducción pausada");
      return;
    }

    if (event.raw?.type === "player_resume") {
      setPlayerStatus("playing");
      setPlayerText("Reproducción reanudada");
      return;
    }

    if (event.raw?.type === "player_stop") {
      setPlayerStatus("stopped");
      setPlayerText("Reproductor detenido");
      setCurrentSongTitle("");
      setRequestedBy("");
      setPlayerQueue([]);
    }
  }

  function addEvent(event) {
    const normalized = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: event.type || "system",
      text: event.text || "",
      user: event.user || null,
      timestamp: event.timestamp || Date.now(),
      raw: event.raw || null,
    };

    setEvents((prev) => [normalized, ...prev].slice(0, 200));
    handleEventAction(normalized);
  }

  function addSystemLine(text) {
    addEvent({
      type: "system",
      text,
      timestamp: Date.now(),
    });
  }

  function buildBigoUrlFromInput(input) {
    const value = String(input || "").trim();
    if (!value) return "";
    if (/^https?:\/\//i.test(value)) return value;
    return `https://www.bigo.tv/es/${value}`;
  }

  function formatLiveEvent(ev) {
    if (!ev || typeof ev !== "object") {
      return {
        type: "system",
        text: "[evento] inválido",
        timestamp: Date.now(),
      };
    }

    const user = ev.user || ev.username || "Usuario";

    if (ev.type === "chat") {
      const txt = ev.text || ev.message || "";
      return {
        type: txt.startsWith("!") ? "command" : "chat",
        text: txt.startsWith("!")
          ? `[command/chat] ${user}: ${txt}`
          : `[chat] ${user}: ${txt}`,
        user,
        timestamp: ev.ts || Date.now(),
        raw: ev,
      };
    }

    if (ev.type === "command") {
      const command = ev.command || "";
      const args = ev.args || "";
      return {
        type: "command",
        text: `[command] ${user}: ${command}${args ? " " + args : ""}`,
        user,
        timestamp: ev.ts || Date.now(),
        raw: ev,
      };
    }

    if (ev.type === "share") {
      return {
        type: "share",
        text: `[share] ${user}: Gracias por compartir`,
        user,
        timestamp: ev.ts || Date.now(),
        raw: ev,
      };
    }

    if (ev.type === "fan") {
      return {
        type: "fan",
        text: `[fan] ${user}: Bienvenido`,
        user,
        timestamp: ev.ts || Date.now(),
        raw: ev,
      };
    }

    if (ev.type === "gift") {
      const gift = ev.gift || ev.giftName || ev.text || "Regalo";
      const count = ev.count || ev.repeatCount || 1;
      return {
        type: "gift",
        text: `[gift] ${user}: ${gift} x${count}`,
        user,
        timestamp: ev.ts || Date.now(),
        raw: ev,
      };
    }

    if (ev.type === "gift_played") {
      const gift = ev.gift || ev.giftName || "Regalo";
      const count = ev.count || 1;
      return {
        type: "gift",
        text: `[gift] ${user}: ${gift} x${count}`,
        user,
        timestamp: ev.ts || Date.now(),
        raw: ev,
      };
    }

    if (ev.type === "player_request") {
      return {
        type: "system",
        text: `[player] solicitando video: ${ev.title || ev.videoId || "sin id"}`,
        user: ev.user || "Usuario",
        timestamp: ev.ts || Date.now(),
        raw: ev,
      };
    }

    if (ev.type === "player_queue_update") {
      return {
        type: "system",
        text: `[player] cola actualizada (${Array.isArray(ev.queue) ? ev.queue.length : 0})`,
        user: null,
        timestamp: ev.ts || Date.now(),
        raw: ev,
      };
    }

    if (ev.type === "player_pause") {
      return {
        type: "system",
        text: `[player] pausado`,
        user,
        timestamp: ev.ts || Date.now(),
        raw: ev,
      };
    }

    if (ev.type === "player_resume") {
      return {
        type: "system",
        text: `[player] reanudado`,
        user,
        timestamp: ev.ts || Date.now(),
        raw: ev,
      };
    }

    if (ev.type === "player_stop") {
      return {
        type: "system",
        text: `[player] detenido`,
        user,
        timestamp: ev.ts || Date.now(),
        raw: ev,
      };
    }

    return {
      type: ev.type || "system",
      text: `[${ev.type || "evento"}] ${user}`,
      user,
      timestamp: ev.ts || Date.now(),
      raw: ev,
    };
  }

  useEffect(() => {
    const speech = window.speechSynthesis;

    const fillVoices = () => {
      const availableVoices = (speech?.getVoices?.() || []).map(
        (voice) => `${voice.name} (${voice.lang})`
      );

      setVoices(availableVoices);

      if (!selectedVoice && availableVoices.length > 0) {
        setSelectedVoice(availableVoices[0]);
      }
    };

    fillVoices();

    if (speech && speech.onvoiceschanged !== undefined) {
      speech.onvoiceschanged = fillVoices;
    }

    return () => {
      if (speech && speech.onvoiceschanged === fillVoices) {
        speech.onvoiceschanged = null;
      }
    };
  }, [selectedVoice]);

  useEffect(() => {
    if (!isElectron) {
      addSystemLine("[DEV] Modo navegador activo. Electron no está disponible.");
      return;
    }

    const digoAPI = getElectronApi();

    if (!digoAPI?.onLog || !digoAPI?.onLiveEvent) {
      addSystemLine("[ERROR] API de Electron incompleta.");
      return;
    }

    digoAPI.onLog((msg) => {
      if (typeof msg === "string") {
        addEvent({
          type: "system",
          text: msg,
          timestamp: Date.now(),
        });
      }
    });

    digoAPI.onLiveEvent((ev) => {
      addEvent(formatLiveEvent(ev));


      if (ev?.type === "player_ui") {
  const queue = Array.isArray(ev.queue)
  ? ev.queue.map((item) => ({
      id: `${item.videoId || item.nombre}-${Math.random().toString(36).slice(2, 8)}`,
      title: item.nombre || item.videoId || "Sin título",
      user: item.requestedBy || "Usuario",
      videoId: item.videoId || "",
    }))
  : [];

  setPlayerQueue(queue);

  if (ev.current) {
    setCurrentSongTitle(ev.current.nombre || "Sin título");
    setRequestedBy(ev.current.requestedBy || "Usuario");

    setCurrentVideoId(ev.current.videoId || "");

    // 🔥 AQUÍ agregas esto
    setThumbnail(ev.current.thumbnail || "");

    if (ev.ducking) {
      setPlayerStatus("ducking");
      setPlayerText("Volumen reducido por TTS");
    } else if (ev.playing) {
      setPlayerStatus("playing");
      setPlayerText("Reproduciendo");
    } else {
      setPlayerStatus("paused");
      setPlayerText("Pausado");
    }
  } else {
    setPlayerStatus("idle");
    setPlayerText("Aquí irá el player");
    setCurrentSongTitle("");
    setRequestedBy("");

    // 🔥 Y AQUÍ esto
    setThumbnail("");

    setCurrentVideoId("");
  }

  return;
}

      // NUEVO: feed visual de regalos
      if (ev?.type === "gift" || ev?.type === "gift_played") {
        const giftName = ev.giftName || ev.gift || "Regalo";
        const icon = ev.icon || ev.giftIcon || ev.giftMeta?.icon || "";
        const count = Number(ev.count || ev.repeatCount || 1);
        const coins = Number(ev.coins || ev.giftMeta?.coins || 0);
        const total = coins * count;

        setGiftFeed((prev) => {
  const newItem = {
    id: `${Date.now()}-${Math.random()}`,
    user: ev.user || ev.username || "Usuario",
    giftName,
    icon,
    count,
    coins,
    total,
  };

  const last = prev[0];

  if (
    last &&
    last.giftName === newItem.giftName &&
    last.user === newItem.user &&
    Date.now() - Number(last.id.split("-")[0]) < 500
  ) {
    return prev;
  }

  return [newItem, ...prev].slice(0, 50);
});

        setTotalSeeds((prev) => prev + total);
      }
    });
  }, [isElectron]);

  const handlePushTtsConfig = async (
    nextEnabled = ttsEnabled,
    nextVoice = selectedVoice
  ) => {
    if (!isElectron) {
      setTtsEnabled(nextEnabled);
      return;
    }

    const digoAPI = getElectronApi();

    if (!digoAPI?.setTtsConfig) {
      addSystemLine("[ERROR] setTtsConfig no existe en preload.");
      return;
    }

    const payload = {
      ttsActivo: !!nextEnabled,
      vozSeleccionada: nextVoice || null,
    };

    try {
      await digoAPI.setTtsConfig(payload);
      addSystemLine(
        `[TTS] ${payload.ttsActivo ? "Activado" : "Desactivado"}${
          payload.vozSeleccionada ? ` | Voz: ${payload.vozSeleccionada}` : ""
        }`
      );
    } catch (error) {
      addSystemLine("[ERROR] No se pudo actualizar TTS.");
      console.error(error);
    }
  };

  const handlePushGiftsConfig = async (
    nextEnabled = giftsEnabled,
    extra = {}
  ) => {
    if (!isElectron) {
      setGiftsEnabled(nextEnabled);
      return;
    }

    const digoAPI = getElectronApi();

    if (!digoAPI?.setGiftsConfig) {
      addSystemLine("[ERROR] setGiftsConfig no existe en preload.");
      return;
    }

    const payload = {
      enabled: !!nextEnabled,
      ...extra,
    };

    try {
      await digoAPI.setGiftsConfig(payload);
      addSystemLine(`[GIFTS] ${payload.enabled ? "Activados" : "Desactivados"}`);
    } catch (error) {
      addSystemLine("[ERROR] No se pudo actualizar Gifts.");
      console.error(error);
    }
  };

  const handleConnect = async () => {
    if (!liveId.trim()) {
      addSystemLine("[ERROR] Ingresa el ID de BIGO.");
      return;
    }

    if (!isElectron) {
      addSystemLine("[DEV] En navegador no se puede conectar al live. Usa Electron.");
      return;
    }

    const digoAPI = getElectronApi();

    if (!digoAPI?.connectLive) {
      addSystemLine("[ERROR] connectLive no existe en preload.");
      return;
    }

    const finalUrl = buildBigoUrlFromInput(liveId);

    setIsConnecting(true);

    try {
      const res = await digoAPI.connectLive(finalUrl);

      if (res?.ok) {
        setIsConnected(true);
        addSystemLine(`[OK] Live cargado: ${finalUrl}`);

        await handlePushTtsConfig();
        await handlePushGiftsConfig();
      } else {
        setIsConnected(false);
        addSystemLine("[ERROR] " + (res?.error || "No se pudo conectar."));
      }
    } catch (error) {
      setIsConnected(false);
      addSystemLine("[ERROR] Excepción al conectar.");
      console.error(error);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!isElectron) {
      setIsConnected(false);
      setEvents([
        {
          id: Date.now(),
          type: "system",
          text: "[DEV] Desconexión local en navegador.",
          timestamp: Date.now(),
          user: null,
          raw: null,
        },
      ]);
      return;
    }

    const digoAPI = getElectronApi();

    if (!digoAPI?.disconnectLive) {
      addSystemLine("[ERROR] disconnectLive no existe en preload.");
      return;
    }

    try {
      const res = await digoAPI.disconnectLive();

      if (res?.ok) {
        setIsConnected(false);
        setIsConnecting(false);

        setPlayerStatus("idle");
        setPlayerText("Aquí irá el player");
        setCurrentSongTitle("");
        setRequestedBy("");
        setPlayerQueue([]);

        setLiveAction(null);

        setLatestGift("");
        setLatestCommand("");
        setLatestShare("");
        setLatestFan("");

        setGiftFeed([]);
        setTotalSeeds(0);

        setEvents([
          {
            id: Date.now(),
            type: "system",
            text: "[OK] Live desconectado.",
            timestamp: Date.now(),
            user: null,
            raw: null,
          },
        ]);
      } else {
        addSystemLine("[ERROR] " + (res?.error || "No se pudo desconectar."));
      }
    } catch (error) {
      addSystemLine("[ERROR] Excepción al desconectar.");
      console.error(error);
    }
  };

  const handleToggleTts = async () => {
    const next = !ttsEnabled;
    setTtsEnabled(next);
    await handlePushTtsConfig(next, selectedVoice);
  };

  const handleChangeVoice = async (voice) => {
    setSelectedVoice(voice);
    await handlePushTtsConfig(ttsEnabled, voice);
  };

  const handleToggleGifts = async () => {
    const next = !giftsEnabled;
    setGiftsEnabled(next);
    await handlePushGiftsConfig(next);
  };

  const handlePlayerOpen = async () => {
  const api = getElectronApi();
  const res = await api?.playerOpen?.();

  if (!res?.ok) {
    addSystemLine?.("[PLAYER] No se pudo abrir YouTube.");
    console.error("playerOpen error", res);
  }
};

const handlePlayerNext = async () => {
  const api = getElectronApi();
  const res = await api?.playerNext?.();

  if (!res?.ok) {
    addSystemLine?.("[PLAYER] No se pudo pasar a la siguiente.");
    console.error("playerNext error", res);
  }
};

const handlePlayerStop = async () => {
  const api = getElectronApi();
  const res = await api?.playerStop?.();

  if (!res?.ok) {
    addSystemLine?.("[PLAYER] No se pudo detener el player.");
    console.error("playerStop error", res);
  }
};


  const handleLoadJson = async () => {
    if (!isElectron) {
      setJsonLabel("JSON: demo");
      addSystemLine("[DEV] Selector JSON no disponible en navegador.");
      return;
    }

    const digoAPI = getElectronApi();

    if (!digoAPI?.pickGiftJson) {
      addSystemLine("[ERROR] pickGiftJson no existe en preload.");
      return;
    }

    try {
      const json = await digoAPI.pickGiftJson();
      if (!json) return;

      await handlePushGiftsConfig(giftsEnabled, {
        useCustomJson: true,
        customJsonText: json,
      });

      setJsonLabel("JSON: personalizado");
      addSystemLine("[GIFTS] JSON custom cargado.");
    } catch (error) {
      addSystemLine("[ERROR] No se pudo cargar el JSON.");
      console.error(error);
    }
  };

  return (
    <div className="app">
      <Topbar
        title="Digo PC"
        statusText={
          isConnected
            ? "Conectado"
            : isConnecting
            ? "Conectando..."
            : "Desconectado"
        }
      />

      

      <div className="layout">
        <aside className="sidebar">
          <ConnectCard
            liveId={liveId}
            onChangeLiveId={setLiveId}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
            isConnected={isConnected}
            isConnecting={isConnecting}
          />

          <TtsCard
            enabled={ttsEnabled}
            voices={voices}
            selectedVoice={selectedVoice}
            onToggle={handleToggleTts}
            onChangeVoice={handleChangeVoice}
          />

          <GiftsCard
            enabled={giftsEnabled}
            jsonLabel={jsonLabel}
            onToggle={handleToggleGifts}
            onLoadJson={handleLoadJson}
          />

          <div className="card panel-card">
            <div className="card-kicker">Control</div>
            <h3 className="panel-card-title">Acciones</h3>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={actionsConfig.gift}
                onChange={(e) =>
                  setActionsConfig((prev) => ({
                    ...prev,
                    gift: e.target.checked,
                  }))
                }
              />
              Alertas de Gifts
            </label>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={actionsConfig.share}
                onChange={(e) =>
                  setActionsConfig((prev) => ({
                    ...prev,
                    share: e.target.checked,
                  }))
                }
              />
              Alertas de Shares
            </label>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={actionsConfig.fan}
                onChange={(e) =>
                  setActionsConfig((prev) => ({
                    ...prev,
                    fan: e.target.checked,
                  }))
                }
              />
              Alertas de Fans
            </label>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={actionsConfig.command}
                onChange={(e) =>
                  setActionsConfig((prev) => ({
                    ...prev,
                    command: e.target.checked,
                  }))
                }
              />
              Alertas de Commands
            </label>
          </div>

         
        </aside>

      <main className="content">
  <div className="card player-hero">
    <PlayerPanel
      playerText={playerText}
      playerStatus={playerStatus}
      currentSongTitle={currentSongTitle}
      requestedBy={requestedBy}
      queue={playerQueue}
      thumbnail={thumbnail}
      currentVideoId={currentVideoId}
      onOpenPlayer={handlePlayerOpen}
      onNextTrack={handlePlayerNext}
      onStopPlayer={handlePlayerStop}
    />
  </div>

  <TopGiftersPanel giftFeed={giftFeed} events={events} />

  <div className="dashboard-grid">
    <div className="events-block">
      <EventsPanel
        events={events}
        filter={eventFilter}
        onChangeFilter={setEventFilter}
        giftFeed={giftFeed}
      />
    </div>

    <div className="chat-block">
      <EventsPanel
        events={events}
        filter="chat"
        onChangeFilter={() => {}}
        giftFeed={giftFeed}
        isChatOnly={true}
      />
    </div>
  </div>
</main>
      </div>
    </div>
  );
}

export default Dashboard;