function Topbar({ title, statusText }) {
  const status = (statusText || "").toLowerCase();

  let statusClass = "status-disconnected";

  if (status.includes("conectado")) {
    statusClass = "status-connected";
  } else if (status.includes("conectando")) {
    statusClass = "status-connecting";
  }

  return (
    <div className="topbar">
      <div className="topbar-left">
        <div className="brand">{title}</div>
        <div className="topbar-subtitle">Live control center</div>
      </div>

      <div className={`status ${statusClass}`}>
        {statusText}
      </div>
    </div>
  );
}

export default Topbar;