function LiveActionBanner({ action }) {
  if (!action) return null;

  return (
    <div className={`live-action-banner live-action-${action.type}`}>
      <div className="live-action-title">{action.title}</div>
      <div className="live-action-text">{action.text}</div>
    </div>
  );
}

export default LiveActionBanner;