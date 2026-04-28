function ActivityItem({ label, value }) {
  return (
    <div className="recent-card">
      <div className="recent-label">{label}</div>
      <div className="recent-value">
        {value || "Sin actividad todavía"}
      </div>
    </div>
  );
}

function RecentActivityPanel({
  latestGift,
  latestCommand,
  latestShare,
  latestFan,
}) {
  return (
    <div className="card recent-panel">
      <div className="section-head">
        <h3>Actividad reciente</h3>
      </div>

      <div className="recent-grid">
        <ActivityItem label="Último regalo" value={latestGift} />
        <ActivityItem label="Último comando" value={latestCommand} />
        <ActivityItem label="Último share" value={latestShare} />
        <ActivityItem label="Último fan" value={latestFan} />
      </div>
    </div>
  );
}

export default RecentActivityPanel;