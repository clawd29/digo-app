function GiftsCard({ enabled, jsonLabel, onToggle, onLoadJson }) {
  return (
    <div className="card panel-card">
      <div className="card-kicker">Regalos</div>
      <h3 className="panel-card-title">Gifts</h3>

      <label className="checkbox-row">
        <input type="checkbox" checked={enabled} onChange={onToggle} />
        <span>Gifts activos</span>
      </label>

      <div className="json-label">{jsonLabel}</div>

      <button className="dark-btn" onClick={onLoadJson}>
        Cargar JSON personalizado
      </button>
    </div>
  );
}

export default GiftsCard;