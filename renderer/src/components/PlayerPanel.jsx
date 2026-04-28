import "../styles/player.css";

function PlayerPanel({
  playerText,
  playerStatus,
  currentSongTitle,
  requestedBy,
  queue,
  thumbnail,
  currentVideoId,
  onOpenPlayer,
  onNextTrack,
  onStopPlayer,
}) {
  return (
    <div className="player-panel hero-player-panel">
      <div className="hero-player-layout">
        <div className="hero-player-media">
          {thumbnail ? (
            <img
              src={thumbnail}
              alt="Miniatura del video"
              className="player-thumbnail hero-thumbnail"
            />
          ) : (
            <div className="hero-thumbnail hero-thumbnail-empty">
              Sin portada
            </div>
          )}
        </div>

        <div className="hero-player-content">
          <div
            className={`player-status-badge ${
              playerStatus === "playing" ? "is-playing" : ""
            }`}
          >
            ESTADO: {String(playerStatus || "idle").toUpperCase()}
          </div>

          <p className="player-text">{playerText}</p>

          <div className="player-current-block">
            <span className="player-label">CANCIÓN ACTUAL</span>

            <h3 className="player-current-title">
              {currentSongTitle || "Sin reproducción activa"}
            </h3>
          </div>

          <div className="player-requested-by">
            Pedido por: {requestedBy || "No disponible"}
          </div>

          <div className="player-controls">
            <button type="button" onClick={onOpenPlayer}>
              Abrir YouTube
            </button>

            <button type="button" onClick={onNextTrack}>
              Siguiente
            </button>

            <button type="button" className="stop" onClick={onStopPlayer}>
              Stop
            </button>
          </div>
        </div>
      </div>

      <div className="player-queue-block">
        <span className="player-label">PRÓXIMAS CANCIONES</span>

        <div className="cola">
          {queue && queue.length > 0 ? (
            queue.map((item, index) => {
              const isCurrent = item.videoId && item.videoId === currentVideoId;

              return (
                <div
                  key={item.id}
                  className={`cola-item ${isCurrent ? "cola-item-current" : ""}`}
                >
                  <span className="cola-index">{index + 1}.</span>

                  <div className="cola-meta">
                    <span className="cola-title">
                      {isCurrent ? "▶ " : ""}
                      {item.title}
                    </span>
                    <span className="cola-user">Pedido por: {item.user}</span>
                  </div>
                </div>
              );
            })
          ) : (
            <span className="cola-empty">No hay canciones en cola</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default PlayerPanel;