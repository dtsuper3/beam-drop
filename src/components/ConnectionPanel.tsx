import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { ConnectionState } from '../services/webrtc';

interface ConnectionPanelProps {
  peerId: string;
  connectionState: ConnectionState;
  isInitiator: boolean;
  error: string | null;
  onCreateRoom: () => Promise<string>;
  onJoinRoom: (roomId: string) => Promise<void>;
  onDisconnect: () => void;
}

type Tab = 'create' | 'join';

export function ConnectionPanel({
  peerId,
  connectionState,
  isInitiator,
  error,
  onCreateRoom,
  onJoinRoom,
  onDisconnect,
}: ConnectionPanelProps) {
  const [tab, setTab] = useState<Tab>('create');
  const [remoteInput, setRemoteInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const isConnected = connectionState === 'connected';
  const isIdle = connectionState === 'idle';

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleCreateRoom = async () => {
    setLoading(true);
    try {
      await onCreateRoom();
    } catch {
      // error is set by hook
    }
    setLoading(false);
  };

  const handleJoinRoom = async () => {
    if (!remoteInput.trim()) return;
    setLoading(true);
    try {
      await onJoinRoom(remoteInput.trim());
    } catch {
      // error is set by hook
    }
    setLoading(false);
  };

  const handlePaste = async () => {
    const text = await navigator.clipboard.readText();
    setRemoteInput(text);
  };

  return (
    <div className="glass-card connection-panel">
      <h2 className="section-title">
        <span className="icon">🔗</span> Connection
      </h2>

      <StatusBadge state={connectionState} />

      {error && <div className="error-banner">{error}</div>}

      {isConnected ? (
        <div className="connected-state">
          <div className="connected-icon">✅</div>
          <p className="connected-text">Peer connected! You can now share files.</p>
          <button className="btn btn-danger" onClick={onDisconnect}>
            Disconnect
          </button>
        </div>
      ) : (
        <>
          {isIdle && (
            <div className="tab-bar">
              <button
                className={`tab ${tab === 'create' ? 'active' : ''}`}
                onClick={() => setTab('create')}
              >
                Create Room
              </button>
              <button
                className={`tab ${tab === 'join' ? 'active' : ''}`}
                onClick={() => setTab('join')}
              >
                Join Room
              </button>
            </div>
          )}

          {(tab === 'create' || isInitiator) && (
            <div className="tab-content">
              {!peerId && isIdle && (
                <button
                  className="btn btn-primary btn-full"
                  onClick={handleCreateRoom}
                  disabled={loading}
                >
                  {loading ? (
                    <span className="spinner" />
                  ) : (
                    '🚀 Generate Connection ID'
                  )}
                </button>
              )}

              {peerId && isInitiator && (
                <div className="sdp-share">
                  <p className="step-label">
                    Share this ID with your peer
                  </p>
                  <div className="qr-container">
                    <QRCodeSVG
                      value={peerId}
                      size={160}
                      bgColor="transparent"
                      fgColor="#a78bfa"
                      level="L"
                    />
                  </div>
                  <div className="sdp-field">
                    <input
                      type="text"
                      readOnly
                      value={peerId}
                      className="sdp-textarea"
                      style={{ padding: '0.75rem', height: 'auto', textAlign: 'center', fontSize: '1.25rem', letterSpacing: '2px' }}
                    />
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => copyToClipboard(peerId, 'offer')}
                    >
                      {copiedField === 'offer' ? '✓ Copied!' : '📋 Copy ID'}
                    </button>
                  </div>

                  <p className="waiting-text" style={{ marginTop: '1.5rem', textAlign: 'center' }}>
                    <span className="spinner" /> Waiting for them to connect...
                  </p>
                </div>
              )}
            </div>
          )}

          {tab === 'join' && !isInitiator && (
            <div className="tab-content">
              <p className="step-label">
                Enter the Connection ID from your peer
              </p>
              <div className="sdp-field">
                <input
                  type="text"
                  value={remoteInput}
                  onChange={(e) => setRemoteInput(e.target.value)}
                  className="sdp-textarea"
                  placeholder="e.g. 5d1f8a2b"
                  style={{ padding: '0.75rem', height: 'auto', textAlign: 'center', fontSize: '1.25rem', letterSpacing: '2px' }}
                />
                <div className="btn-row">
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={handlePaste}
                  >
                    📋 Paste
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={handleJoinRoom}
                    disabled={!remoteInput.trim() || loading}
                  >
                    {loading ? <span className="spinner" /> : '🔗 Join'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatusBadge({ state }: { state: ConnectionState }) {
  const config: Record<ConnectionState, { label: string; className: string }> = {
    idle: { label: 'Not Connected', className: 'status-idle' },
    connecting: { label: 'Connecting...', className: 'status-connecting' },
    connected: { label: 'Connected', className: 'status-connected' },
    disconnected: { label: 'Disconnected', className: 'status-disconnected' },
    failed: { label: 'Failed', className: 'status-failed' },
  };

  const { label, className } = config[state];

  return (
    <div className={`status-badge ${className}`}>
      <span className="status-dot" />
      {label}
    </div>
  );
}
