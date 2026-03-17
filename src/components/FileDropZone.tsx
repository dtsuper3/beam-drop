import { useState, useRef, useCallback } from 'react';

interface FileDropZoneProps {
  onFilesSelected: (files: File[]) => void;
  disabled: boolean;
}

export function FileDropZone({ onFilesSelected, disabled }: FileDropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled) setIsDragOver(true);
    },
    [disabled]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      if (disabled) return;

      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        onFilesSelected(files);
      }
    },
    [disabled, onFilesSelected]
  );

  const handleClick = () => {
    if (!disabled) {
      fileInputRef.current?.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      onFilesSelected(files);
      // Reset input so same file can be selected again
      e.target.value = '';
    }
  };

  return (
    <div
      className={`file-drop-zone ${isDragOver ? 'drag-over' : ''} ${disabled ? 'disabled' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
      <div className="drop-zone-content">
        <div className="drop-icon">{isDragOver ? '📂' : '📁'}</div>
        <p className="drop-title">
          {disabled
            ? 'Connect to a peer first'
            : isDragOver
              ? 'Drop files here!'
              : 'Drag & drop files here'}
        </p>
        {!disabled && (
          <p className="drop-subtitle">
            or <span className="browse-link">browse files</span>
          </p>
        )}
      </div>
    </div>
  );
}
