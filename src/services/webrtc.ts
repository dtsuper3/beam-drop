import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';

export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed';

export interface WebRTCCallbacks {
  onStateChange: (state: ConnectionState) => void;
  onDataChannel: (channel: DataConnection) => void;
  onError: (error: Error) => void;
}

export class WebRTCService {
  private peer: Peer | null = null;
  private dataConnection: DataConnection | null = null;
  private callbacks: WebRTCCallbacks;
  private _state: ConnectionState = 'idle';
  private _peerId: string | null = null;

  constructor(callbacks: WebRTCCallbacks) {
    this.callbacks = callbacks;
  }

  get state(): ConnectionState {
    return this._state;
  }

  get peerId(): string | null {
    return this._peerId;
  }

  private setState(state: ConnectionState) {
    this._state = state;
    this.callbacks.onStateChange(state);
  }

  /**
   * Initialize PeerJS with an optional ID (for the host).
   * If no ID is provided, PeerJS generates one, but we prefer assigning UUIDs.
   */
  async initialize(id?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const peerConfig = {
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' },
          ],
        },
      };

      this.peer = id ? new Peer(id, peerConfig) : new Peer(peerConfig);

      this.peer.on('open', (assignedId) => {
        this._peerId = assignedId;
        resolve(assignedId);
      });

      this.peer.on('error', (err) => {
        console.error('PeerJS error:', err);
        this.callbacks.onError(err);
        this.setState('failed');
        reject(err);
      });

      // Listen for incoming connections (Host side)
      this.peer.on('connection', (conn) => {
        this.setupDataConnection(conn);
      });
      
      this.peer.on('disconnected', () => {
        if (this._state === 'connected') {
           this.setState('disconnected');
        }
      });
    });
  }

  /**
   * Connect to another peer by their ID (Client side).
   */
  connectToPeer(remoteId: string): void {
    if (!this.peer) {
      throw new Error('PeerJS not initialized');
    }

    this.setState('connecting');
    const conn = this.peer.connect(remoteId, {
      reliable: true,
      serialization: 'binary',
    });

    this.setupDataConnection(conn);
  }

  private setupDataConnection(conn: DataConnection) {
    this.dataConnection = conn;

    conn.on('open', () => {
      this.setState('connected');
      this.callbacks.onDataChannel(conn);
    });

    conn.on('close', () => {
      this.setState('disconnected');
      this.dataConnection = null;
    });

    conn.on('error', (err) => {
      this.callbacks.onError(err);
    });
  }

  getDataConnection(): DataConnection | null {
    return this.dataConnection;
  }

  disconnect() {
    this.dataConnection?.close();
    this.peer?.destroy();
    this.dataConnection = null;
    this.peer = null;
    this._peerId = null;
    this.setState('idle');
  }
}
