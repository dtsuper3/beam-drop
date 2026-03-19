import type { DataConnection } from 'peerjs';

// --- Constants ---
const CHUNK_SIZE = 64 * 1024; // 64 KB
const MAX_BUFFERED_AMOUNT = 1024 * 1024; // 1 MB backpressure threshold

// --- Protocol Types ---
export type MessageType =
  | 'FILE_META'
  | 'FILE_CHUNK'
  | 'FILE_COMPLETE'
  | 'TRANSFER_CANCEL';

export interface FileMetaMessage {
  type: 'FILE_META';
  fileId: string;
  name: string;
  size: number;
  fileType: string;
  totalChunks: number;
}

export interface FileChunkHeader {
  type: 'FILE_CHUNK';
  fileId: string;
  chunkIndex: number;
  byteLength: number;
}

export interface FileCompleteMessage {
  type: 'FILE_COMPLETE';
  fileId: string;
}

export interface TransferCancelMessage {
  type: 'TRANSFER_CANCEL';
  fileId: string;
}

export type ProtocolMessage =
  | FileMetaMessage
  | FileChunkHeader
  | FileCompleteMessage
  | TransferCancelMessage;

// --- Transfer State ---
export type TransferDirection = 'upload' | 'download';
/* eslint-disable @typescript-eslint/no-unused-vars */
export type TransferStatus =
  | 'pending'
  | 'transferring'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface TransferInfo {
  fileId: string;
  name: string;
  size: number;
  fileType: string;
  direction: TransferDirection;
  status: TransferStatus;
  progress: number; // 0-1
  speed: number; // bytes per second
  bytesTransferred: number;
  totalChunks: number;
  error?: string;
}

export interface FileTransferCallbacks {
  onTransferUpdate: (transfer: TransferInfo) => void;
  onFileReceived: (fileId: string, name: string, blob: Blob) => void;
  onError: (error: Error) => void;
}

export class FileTransferService {
  private channel: DataConnection | null = null;
  private callbacks: FileTransferCallbacks;

  // Active transfers
  private uploads: Map<string, UploadState> = new Map();
  private downloads: Map<string, DownloadState> = new Map();
  private sendChain: Promise<void> = Promise.resolve();

  constructor(callbacks: FileTransferCallbacks) {
    this.callbacks = callbacks;
  }

  async initialize(channel: DataConnection): Promise<void> {
    this.channel = channel;
    
    // PeerJS DataConnection abstracts ArrayBuffers nicely
    channel.on('data', (data) => this.handleData(data));
  }

  private async handleData(data: unknown): Promise<void> {
    if (typeof data === 'string') {
      const msg = JSON.parse(data) as ProtocolMessage;
      switch (msg.type) {
        case 'FILE_META':
          this.handleFileMeta(msg);
          break;
        case 'FILE_CHUNK':
          // Keep track of the chunk header so the next binary packet can be assigned its chunkIndex.
          this.pendingChunkHeader = msg;
          break;
        case 'FILE_COMPLETE':
          await this.handleFileComplete(msg);
          break;
        case 'TRANSFER_CANCEL':
          this.handleTransferCancel(msg);
          break;
      }
    } else if (data instanceof ArrayBuffer) {
      // Binary data: this is a file chunk
      await this.handleBinaryChunk(data);
    } else if (data instanceof Uint8Array) {
      // PeerJS sometimes yields Uint8Array
      await this.handleBinaryChunk(data.buffer as ArrayBuffer);
    }
  }

  private handleFileMeta(msg: FileMetaMessage): void {
    const download: DownloadState = {
      fileId: msg.fileId,
      name: msg.name,
      size: msg.size,
      fileType: msg.fileType,
      totalChunks: msg.totalChunks,
      chunks: new Array<BlobPart>(msg.totalChunks),
      receivedChunks: 0,
      bytesReceived: 0,
      startTime: Date.now(),
    };
    this.downloads.set(msg.fileId, download);

    this.emitTransferUpdate(download, 'download', 'transferring');
  }

  private pendingChunkHeader: FileChunkHeader | null = null;

  private async handleBinaryChunk(data: ArrayBuffer): Promise<void> {
    // Check if this binary data starts with a JSON header
    // Our protocol: send JSON header, then send binary chunk separately
    // But both arrive as separate messages. We track pending headers.
    if (this.pendingChunkHeader) {
      const header = this.pendingChunkHeader;
      this.pendingChunkHeader = null;

      const download = this.downloads.get(header.fileId);
      if (!download) return;

      try {
        download.chunks[header.chunkIndex] = new Uint8Array(data);
        download.receivedChunks++;
        download.bytesReceived += data.byteLength;

        this.emitTransferUpdate(download, 'download', 'transferring');
      } catch (err) {
        this.callbacks.onError(
          new Error(`Failed receiving chunk ${header.chunkIndex}: ${err}`)
        );
      }
    }
  }

  private async handleFileComplete(msg: FileCompleteMessage): Promise<void> {
    const download = this.downloads.get(msg.fileId);
    if (!download) return;

    // Reassemble the file
    const blob = new Blob(download.chunks, { type: download.fileType });
    this.emitTransferUpdate(download, 'download', 'completed');
    this.callbacks.onFileReceived(download.fileId, download.name, blob);
    this.downloads.delete(msg.fileId);
  }

  private handleTransferCancel(msg: TransferCancelMessage): void {
    const download = this.downloads.get(msg.fileId);
    if (download) {
      this.emitTransferUpdate(download, 'download', 'cancelled');
      this.downloads.delete(msg.fileId);
    }
  }

  /**
   * Send one or more files through the data channel sequentially.
   */
  async sendFiles(files: File[]): Promise<void> {
    const task = async () => {
      for (const file of files) {
        await this.sendFile(file);
      }
    };
    
    // Chain promises to prevent chunk interleaving from multiple concurrent calls
    this.sendChain = this.sendChain.then(
      task,
      () => task() // If previous failed, still run new task
    );
    return this.sendChain;
  }

  private async sendFile(file: File): Promise<void> {
    if (!this.channel || !this.channel.open) {
      throw new Error('Data channel is not open');
    }

    const fileId = crypto.randomUUID();
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    const upload: UploadState = {
      fileId,
      name: file.name,
      size: file.size,
      fileType: file.type || 'application/octet-stream',
      totalChunks,
      sentChunks: 0,
      bytesSent: 0,
      startTime: Date.now(),
      cancelled: false,
    };
    this.uploads.set(fileId, upload);

    // Send file metadata
    const meta: FileMetaMessage = {
      type: 'FILE_META',
      fileId,
      name: file.name,
      size: file.size,
      fileType: file.type || 'application/octet-stream',
      totalChunks,
    };
    this.channel.send(JSON.stringify(meta));
    this.emitTransferUpdate(upload, 'upload', 'transferring');

    // Send chunks
    for (let i = 0; i < totalChunks; i++) {
      if (upload.cancelled) {
        this.emitTransferUpdate(upload, 'upload', 'cancelled');
        return;
      }

      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = await file.slice(start, end).arrayBuffer();

      // Backpressure: wait if buffer is full
      await this.waitForBufferDrain();

      // Send chunk header
      const header: FileChunkHeader = {
        type: 'FILE_CHUNK',
        fileId,
        chunkIndex: i,
        byteLength: chunk.byteLength,
      };
      this.channel!.send(JSON.stringify(header));

      // Send binary data
      this.channel!.send(chunk);

      upload.sentChunks++;
      upload.bytesSent += chunk.byteLength;
      this.emitTransferUpdate(upload, 'upload', 'transferring');
    }

    // Send completion message
    const complete: FileCompleteMessage = {
      type: 'FILE_COMPLETE',
      fileId,
    };
    this.channel.send(JSON.stringify(complete));
    this.emitTransferUpdate(upload, 'upload', 'completed');
    this.uploads.delete(fileId);
  }

  cancelTransfer(fileId: string): void {
    const upload = this.uploads.get(fileId);
    if (upload) {
      upload.cancelled = true;
      // Notify receiver to clean up resources
      const cancelMsg: TransferCancelMessage = {
        type: 'TRANSFER_CANCEL',
        fileId,
      };
      if (this.channel && this.channel.open) {
        this.channel.send(JSON.stringify(cancelMsg));
      }
    }
  }

  private waitForBufferDrain(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (!this.channel || !this.channel.open) {
          resolve(); // Channel closed
          return;
        }
        
        const dataChannel = this.channel.dataChannel as RTCDataChannel | undefined;
        if (!dataChannel || dataChannel.bufferedAmount <= MAX_BUFFERED_AMOUNT) {
          resolve();
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    });
  }

  private emitTransferUpdate(
    state: UploadState | DownloadState,
    direction: TransferDirection,
    status: TransferStatus
  ): void {
    const elapsed = (Date.now() - state.startTime) / 1000;
    const bytesTransferred =
      direction === 'upload'
        ? (state as UploadState).bytesSent
        : (state as DownloadState).bytesReceived;
    const speed = elapsed > 0 ? bytesTransferred / elapsed : 0;

    const info: TransferInfo = {
      fileId: state.fileId,
      name: state.name,
      size: state.size,
      fileType: state.fileType,
      direction,
      status,
      progress: bytesTransferred / state.size || 0,
      speed,
      bytesTransferred,
      totalChunks: state.totalChunks,
    };

    this.callbacks.onTransferUpdate(info);
  }

  destroy(): void {
    this.uploads.clear();
    this.downloads.clear();
    this.channel = null;
  }
}

// --- Internal State Types ---
interface UploadState {
  fileId: string;
  name: string;
  size: number;
  fileType: string;
  totalChunks: number;
  sentChunks: number;
  bytesSent: number;
  startTime: number;
  cancelled: boolean;
}

interface DownloadState {
  fileId: string;
  name: string;
  size: number;
  fileType: string;
  totalChunks: number;
  chunks: BlobPart[];
  receivedChunks: number;
  bytesReceived: number;
  startTime: number;
}
