import { useState, useCallback, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { WebRTCService } from '../services/webrtc';
import type { ConnectionState } from '../services/webrtc';
import type { DataConnection } from 'peerjs';

export interface UseWebRTCReturn {
  peerId: string;
  connectionState: ConnectionState;
  isInitiator: boolean;
  createRoom: () => Promise<string>;
  joinRoom: (roomId: string) => Promise<void>;
  disconnect: () => void;
  dataChannel: DataConnection | null;
  error: string | null;
}

export function useWebRTC(): UseWebRTCReturn {
  const [peerId, setPeerId] = useState('');
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [isInitiator, setIsInitiator] = useState(false);
  const [dataChannel, setDataChannel] = useState<DataConnection | null>(null);
  const [error, setError] = useState<string | null>(null);

  const serviceRef = useRef<WebRTCService | null>(null);

  const getService = useCallback(() => {
    if (!serviceRef.current) {
      serviceRef.current = new WebRTCService({
        onStateChange: setConnectionState,
        onDataChannel: setDataChannel,
        onError: (err) => setError(err.message),
      });
    }
    return serviceRef.current;
  }, []);

  const createRoom = useCallback(async (): Promise<string> => {
    setError(null);
    setIsInitiator(true);

    // Clear old service if it exists
    serviceRef.current?.disconnect();
    serviceRef.current = null;

    const service = getService();
    // Generate a short ID for easier mixing. e.g. first 8 chars of a UUID
    const id = uuidv4().substring(0, 8); 
    
    const assignedId = await service.initialize(id);
    setPeerId(assignedId);
    return assignedId;
  }, [getService]);

  const joinRoom = useCallback(async (roomId: string): Promise<void> => {
    setError(null);
    setIsInitiator(false);

    // Clear old service if it exists
    serviceRef.current?.disconnect();
    serviceRef.current = null;

    const service = getService();
    // Initialize without an ID for the client side
    const assignedId = await service.initialize();
    setPeerId(assignedId);
    
    service.connectToPeer(roomId);
  }, [getService]);

  const disconnect = useCallback(() => {
    serviceRef.current?.disconnect();
    serviceRef.current = null;
    setDataChannel(null);
    setPeerId('');
    setIsInitiator(false);
    setError(null);
  }, []);

  useEffect(() => {
    return () => {
      serviceRef.current?.disconnect();
    };
  }, []);

  return {
    peerId,
    connectionState,
    isInitiator,
    createRoom,
    joinRoom,
    disconnect,
    dataChannel,
    error,
  };
}
