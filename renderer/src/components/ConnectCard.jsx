function ConnectCard({
  liveId,
  onChangeLiveId,
  onConnect,
  onDisconnect,
  isConnected,
  isConnecting,
}) {
  return (
    <div className="card connect-card">
      <div className="card-kicker">Conexión</div>
      <h3 className="connect-card-title">ID de BIGO</h3>

      <label className="field-label">Ingresa el ID o usuario</label>

      <input
        type="text"
        placeholder="Bigo_ID"
        value={liveId}
        onChange={(e) => onChangeLiveId(e.target.value)}
      />

      <button onClick={onConnect} disabled={isConnected || isConnecting}>
        {isConnecting ? "Conectando..." : "Conectar"}
      </button>

      <button
        className="secondary-btn"
        onClick={onDisconnect}
        disabled={!isConnected}
      >
        Desconectar
      </button>
    </div>
  );
}

export default ConnectCard;