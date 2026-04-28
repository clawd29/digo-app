function formatTime(timestamp) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function getEventBadgeClass(type) {
  switch (type) {
    case "chat":
      return "badge badge-chat";
    case "gift":
      return "badge badge-gift";
    case "share":
      return "badge badge-share";
    case "fan":
      return "badge badge-fan";
    case "command":
      return "badge badge-command";
    case "system":
    default:
      return "badge badge-system";
  }
}

function GiftItem({ item }) {
  const total = item.total || 0;

  const isBig = total >= 100 && total < 500;
  const isMega = total >= 300;

  return (
    <div
      className={`gift-item ${
        isBig ? "gift-item-big" : ""
      } ${isMega ? "gift-item-mega" : ""}`}
    >
      <div className="gift-left">
        {item.icon ? (
          <img src={item.icon} alt={item.giftName} className="gift-icon" />
        ) : (
          <div className="gift-icon gift-icon-fallback">🎁</div>
        )}

        <div className="gift-meta">
          <div className="gift-name">{item.giftName}</div>

          <div className="gift-sub">
            {item.coins || 0} semillas x{item.count || 1}
          </div>

          <div className="gift-user">{item.user}</div>
        </div>
      </div>

      <div className="gift-total">+{item.total || 0}</div>
    </div>
  );
}

function EventsPanel({
  events,
  filter,
  onChangeFilter,
  giftFeed = [],
  isChatOnly = false,
}) {
  const shareCount = events.filter((event) => event.type === "share").length;
  const fanCount = events.filter((event) => event.type === "fan").length;
  const systemCount = events.filter((event) => event.type === "system").length;
  const commandCount = events.filter((event) => event.type === "command").length;

  const groupedGifts = Object.values(
    giftFeed.reduce((acc, item) => {
      const key = `${item.giftName || "Regalo"}-${item.user || "Usuario"}`;

      if (!acc[key]) {
        acc[key] = {
          ...item,
          giftName: item.giftName || "Regalo",
          user: item.user || "Usuario",
          icon: item.icon || "",
          coins: Number(item.coins || 0),
          count: Number(item.count || 1),
          total: Number(item.total || 0),
        };
      } else {
        acc[key].count += Number(item.count || 1);
        acc[key].total += Number(item.total || 0);
      }

      return acc;
    }, {})
  );

  const giftCount = groupedGifts.length;


const filteredEventsRaw = isChatOnly
  ? events.filter((event) => event.type === "chat")
  : events.filter((event) => event.type === filter);

const filteredEvents = filteredEventsRaw.filter((event, index, arr) => {
  // Dedupe visual para tipos que pueden repetirse por re-render del DOM
  if (event.type === "chat" || event.type === "share") {
    const type = (event.type || "").toLowerCase().trim();
    const user = (event.user || "").toLowerCase().trim();
    const text = (event.text || "").toLowerCase().trim();

    const firstIndex = arr.findIndex(
      (e) =>
        (e.type || "").toLowerCase().trim() === type &&
        (e.user || "").toLowerCase().trim() === user &&
        (e.text || "").toLowerCase().trim() === text
    );

    return index === firstIndex;
  }

  return true;
});

  return (
    <div className="card">
      <div className="section-head">
        <h3>{isChatOnly ? "Chat en vivo" : "Eventos"}</h3>
        <span className="section-chip">Tiempo real</span>
      </div>

      {!isChatOnly && (
        <div className="event-filters">
          <button
            className={filter === "gift" ? "active" : ""}
            onClick={() => onChangeFilter("gift")}
          >
            Gifts
            <span className="filter-count">{giftCount}</span>
          </button>

          <button
            className={filter === "share" ? "active" : ""}
            onClick={() => onChangeFilter("share")}
          >
            Shares
            <span className="filter-count">{shareCount}</span>
          </button>

          <button
            className={filter === "fan" ? "active" : ""}
            onClick={() => onChangeFilter("fan")}
          >
            Fans
            <span className="filter-count">{fanCount}</span>
          </button>

          <button
            className={filter === "command" ? "active" : ""}
            onClick={() => onChangeFilter("command")}
          >
            Commands
            <span className="filter-count">{commandCount}</span>
          </button>

          <button
            className={filter === "system" ? "active" : ""}
            onClick={() => onChangeFilter("system")}
          >
            Sistema
            <span className="filter-count">{systemCount}</span>
          </button>
        </div>
      )}

      <div className="log">
        {isChatOnly ? (
          filteredEvents.length === 0 ? (
            <div className="line empty-line">No hay mensajes en el chat</div>
          ) : (
            filteredEvents.map((event) => (
              <div key={event.id} className="chat-row">
                <div className="event-meta">
                  <span className="chat-live-dot">●</span>

                  <span className="event-time">
                    {formatTime(event.timestamp)}
                  </span>
                </div>

                <div className="chat-message">
                  <span
                    className="chat-user"
                    style={{
                      color: `hsl(${(event.user?.length * 40) % 360}, 90%, 70%)`
                    }}
                  >
                    {event.user || "Usuario"}:
</span>
                  <span className="chat-text">{event.text}</span>
                </div>
              </div>
            ))
          )
        ) : filter === "gift" ? (
          groupedGifts.length === 0 ? (
            <div className="line empty-line">No hay regalos todavía</div>
          ) : (
            groupedGifts.map((item, index) => (
              <GiftItem
                key={`${item.giftName}-${item.user}-${index}`}
                item={item}
              />
            ))
          )
        ) : filteredEvents.length === 0 ? (
          <div className="line empty-line">
            No hay eventos de tipo "{filter}"
          </div>
        ) : (
          filteredEvents.map((event) => (
            <div
              key={event.id}
              className={`event-row event-row-${event.type || "system"}`}
            >
              <div className="event-meta">
                <span className={getEventBadgeClass(event.type)}>
                  {event.type}
                </span>

                <span className="event-time">
                  {formatTime(event.timestamp)}
                </span>
              </div>

              <div className="event-text">{event.text}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default EventsPanel;