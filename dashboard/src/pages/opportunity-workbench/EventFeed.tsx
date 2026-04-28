import type { OpportunityStreamEvent } from '../../hooks/useAgentStream';

type EventFeedProps = {
  events: OpportunityStreamEvent[];
  isConnected: boolean;
};

export function EventFeed({ events, isConnected }: EventFeedProps) {
  return (
    <div className="opportunity-events glass-panel">
      <div className="stream-header">
        <span>STRUCTURED OPPORTUNITY FLOW</span>
        <span className={`live-dot ${isConnected ? 'connected' : ''}`}>
          {isConnected ? '● CONNECTED' : '○ POLLING'}
        </span>
      </div>
      <div className="op-event-list">
        {events.length === 0 ? (
          <div className="today-empty">还没有机会事件</div>
        ) : (
          events.map((event) => (
            <div key={event.id} className="op-event-item">
              <div className="op-event-top">
                <span className={`diff-chip ${event.type.includes('failed') || event.type.includes('degraded') || event.type.includes('broken') ? 'changed' : 'stable'}`}>
                  {event.type}
                </span>
                <span className="stream-time">{new Date(event.timestamp).toLocaleString()}</span>
              </div>
              <div className="op-event-message">{event.message}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
