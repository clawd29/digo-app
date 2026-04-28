const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("digoAPI", {
  // live
  connectLive: (url) => ipcRenderer.invoke("connect-live", url),
  disconnectLive: () => ipcRenderer.invoke("disconnect-live"),

  // config
  setTtsConfig: (config) => ipcRenderer.invoke("set-tts-config", config),
  setGiftsConfig: (config) => ipcRenderer.invoke("set-gifts-config", config),
  pickGiftJson: () => ipcRenderer.invoke("pick-gift-json"),

  // player
  openPlayerHome: (useMusic = false) => ipcRenderer.invoke("open-player-home", useMusic),
  playInPlayer: (payload) => ipcRenderer.invoke("play-in-player", payload),
  closePlayer: () => ipcRenderer.invoke("close-player"),
  playerNext: () => ipcRenderer.invoke("player-next"),
  playerStop: () => ipcRenderer.invoke("player-stop"),
  playerOpen: () => ipcRenderer.invoke("player-open"),

  // from hidden page
  sendEventFromPage: (payload) => ipcRenderer.send("event-from-page", payload),
  sendLogFromPage: (text) => ipcRenderer.send("log-from-page", text),

  // listeners
  onLog: (cb) => ipcRenderer.on("log", (_, msg) => cb(msg)),
  onLiveEvent: (cb) => ipcRenderer.on("live-event", (_, payload) => cb(payload))
});