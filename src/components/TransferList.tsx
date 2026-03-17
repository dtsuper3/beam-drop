import type { TransferInfo } from '../services/fileTransfer';
import type { ReceivedFile } from '../hooks/useFileTransfer';

interface TransferListProps {
  transfers: TransferInfo[];
  receivedFiles: ReceivedFile[];
  onCancel: (fileId: string) => void;
  onDownload: (fileId: string) => void;
}

export function TransferList({
  transfers,
  receivedFiles,
  onCancel,
  onDownload,
}: TransferListProps) {
  if (transfers.length === 0 && receivedFiles.length === 0) {
    return (
      <div className="transfer-list-empty">
        <p className="empty-icon">📭</p>
        <p className="empty-text">No transfers yet</p>
      </div>
    );
  }

  return (
    <div className="transfer-list">
      {transfers.map((t) => (
        <TransferItem
          key={t.fileId}
          transfer={t}
          receivedFile={receivedFiles.find((f) => f.fileId === t.fileId)}
          onCancel={onCancel}
          onDownload={onDownload}
        />
      ))}
    </div>
  );
}

function TransferItem({
  transfer,
  receivedFile,
  onCancel,
  onDownload,
}: {
  transfer: TransferInfo;
  receivedFile?: ReceivedFile;
  onCancel: (id: string) => void;
  onDownload: (id: string) => void;
}) {
  const isUpload = transfer.direction === 'upload';
  const percent = Math.round(transfer.progress * 100);

  return (
    <div className={`transfer-item ${transfer.status}`}>
      <div className="transfer-header">
        <div className="transfer-info">
          <span className="transfer-icon">{getFileIcon(transfer.fileType)}</span>
          <div className="transfer-meta">
            <span className="transfer-name">{transfer.name}</span>
            <span className="transfer-size">{formatSize(transfer.size)}</span>
          </div>
        </div>
        <div className="transfer-badges">
          <span className={`direction-badge ${transfer.direction}`}>
            {isUpload ? '⬆ Upload' : '⬇ Download'}
          </span>
          <TransferStatusBadge status={transfer.status} />
        </div>
      </div>

      {transfer.status === 'transferring' && (
        <div className="progress-container">
          <div className="progress-bar-track">
            <div
              className="progress-bar-fill"
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="progress-details">
            <span className="progress-percent">{percent}%</span>
            <span className="progress-speed">
              {formatSpeed(transfer.speed)}
            </span>
            <span className="progress-eta">
              {formatETA(transfer.size - transfer.bytesTransferred, transfer.speed)}
            </span>
          </div>
        </div>
      )}

      <div className="transfer-actions">
        {transfer.status === 'transferring' && isUpload && (
          <button
            className="btn btn-danger btn-xs"
            onClick={() => onCancel(transfer.fileId)}
          >
            Cancel
          </button>
        )}
        {transfer.status === 'completed' && !isUpload && receivedFile && (
          <button
            className="btn btn-primary btn-xs"
            onClick={() => onDownload(transfer.fileId)}
          >
            💾 Save File
          </button>
        )}
      </div>
    </div>
  );
}

function TransferStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    pending: { label: 'Pending', className: 'ts-pending' },
    transferring: { label: 'Transferring', className: 'ts-active' },
    completed: { label: 'Complete', className: 'ts-complete' },
    failed: { label: 'Failed', className: 'ts-failed' },
    cancelled: { label: 'Cancelled', className: 'ts-cancelled' },
  };
  const { label, className } = config[status] || config.pending;

  return <span className={`transfer-status-badge ${className}`}>{label}</span>;
}

function getFileIcon(type: string): string {
  if (type.startsWith('image/')) return '🖼️';
  if (type.startsWith('video/')) return '🎬';
  if (type.startsWith('audio/')) return '🎵';
  if (type.includes('pdf')) return '📄';
  if (type.includes('zip') || type.includes('rar') || type.includes('tar'))
    return '🗜️';
  if (type.includes('text')) return '📝';
  return '📄';
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatSpeed(bytesPerSec: number): string {
  return `${formatSize(bytesPerSec)}/s`;
}

function formatETA(remainingBytes: number, speed: number): string {
  if (speed <= 0) return '';
  const seconds = Math.ceil(remainingBytes / speed);
  if (seconds < 60) return `${seconds}s left`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)}m left`;
  return `${Math.ceil(seconds / 3600)}h left`;
}
