import { useState, useCallback, useRef, useEffect } from 'react';
import {
  FileTransferService,
} from '../services/fileTransfer';
import type {
  TransferInfo,
} from '../services/fileTransfer';
import type { DataConnection } from 'peerjs';

export interface UseFileTransferReturn {
  transfers: TransferInfo[];
  receivedFiles: ReceivedFile[];
  sendFiles: (files: File[]) => Promise<void>;
  cancelTransfer: (fileId: string) => void;
  downloadFile: (fileId: string) => void;
  isReady: boolean;
}

export interface ReceivedFile {
  fileId: string;
  name: string;
  blob: Blob;
  url: string;
}

export function useFileTransfer(
  dataChannel: DataConnection | null
): UseFileTransferReturn {
  const [transfers, setTransfers] = useState<TransferInfo[]>([]);
  const [receivedFiles, setReceivedFiles] = useState<ReceivedFile[]>([]);
  const serviceRef = useRef<FileTransferService | null>(null);
  const [isReady, setIsReady] = useState(false);

  const updateTransfer = useCallback((transfer: TransferInfo) => {
    setTransfers((prev) => {
      const idx = prev.findIndex((t) => t.fileId === transfer.fileId);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = transfer;
        return next;
      }
      return [...prev, transfer];
    });
  }, []);

  const handleFileReceived = useCallback(
    (fileId: string, name: string, blob: Blob) => {
      const url = URL.createObjectURL(blob);
      setReceivedFiles((prev) => [...prev, { fileId, name, blob, url }]);
    },
    []
  );

  useEffect(() => {
    if (!dataChannel || !dataChannel.open) {
      setIsReady(false);
      return;
    }

    const service = new FileTransferService({
      onTransferUpdate: updateTransfer,
      onFileReceived: handleFileReceived,
      onError: (err) => console.error('Transfer error:', err),
    });

    service.initialize(dataChannel).then(() => {
      serviceRef.current = service;
      setIsReady(true);
    });

    return () => {
      service.destroy();
      serviceRef.current = null;
      setIsReady(false);
    };
  }, [dataChannel, updateTransfer, handleFileReceived]);

  const sendFiles = useCallback(async (files: File[]) => {
    if (!serviceRef.current) throw new Error('Transfer service not ready');
    await serviceRef.current.sendFiles(files);
  }, []);

  const cancelTransfer = useCallback((fileId: string) => {
    serviceRef.current?.cancelTransfer(fileId);
  }, []);

  const downloadFile = useCallback(
    (fileId: string) => {
      const file = receivedFiles.find((f) => f.fileId === fileId);
      if (!file) return;

      const a = document.createElement('a');
      a.href = file.url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    },
    [receivedFiles]
  );

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      receivedFiles.forEach((f) => URL.revokeObjectURL(f.url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    transfers,
    receivedFiles,
    sendFiles,
    cancelTransfer,
    downloadFile,
    isReady,
  };
}
