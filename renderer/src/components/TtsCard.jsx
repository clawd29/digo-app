function TtsCard({ enabled, voices, selectedVoice, onToggle, onChangeVoice }) {
  return (
    <div className="card panel-card">
      <div className="card-kicker">Audio</div>
      <h3 className="panel-card-title">TTS</h3>

      <label className="checkbox-row">
        <input type="checkbox" checked={enabled} onChange={onToggle} />
        <span>TTS activo</span>
      </label>

      <label className="field-label">Voz</label>

      <select
        value={selectedVoice}
        onChange={(e) => onChangeVoice(e.target.value)}
      >
        {voices.length === 0 ? (
          <option value="">Sin voces disponibles</option>
        ) : (
          voices.map((voice) => (
            <option key={voice} value={voice}>
              {voice}
            </option>
          ))
        )}
      </select>
    </div>
  );
}

export default TtsCard;