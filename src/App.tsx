import { useCallback } from 'react';
import { useWebRTC } from './hooks/useWebRTC';
import { useFileTransfer } from './hooks/useFileTransfer';
import { ConnectionPanel } from './components/ConnectionPanel';
import { FileDropZone } from './components/FileDropZone';
import { TransferList } from './components/TransferList';

function App() {
  const {
    peerId,
    connectionState,
    isInitiator,
    createRoom,
    joinRoom,
    disconnect,
    dataChannel,
    error,
  } = useWebRTC();

  const {
    transfers,
    receivedFiles,
    sendFiles,
    cancelTransfer,
    downloadFile,
    isReady,
  } = useFileTransfer(dataChannel);

  const isConnected = connectionState === 'connected';

  const handleFilesSelected = useCallback(
    async (files: File[]) => {
      if (!isReady) return;
      try {
        await sendFiles(files);
      } catch (err) {
        console.error('Send failed:', err);
      }
    },
    [isReady, sendFiles]
  );

  return (
    <div className="app">
      {/* Animated background */}
      <div className="bg-grid" />
      <div className="bg-glow bg-glow-1" />
      <div className="bg-glow bg-glow-2" />

      <header className="header">
        <div className="logo">
          <span className="logo-icon">⚡</span>
          <h1 className="logo-text">
            Beam<span className="logo-accent">Drop</span>
          </h1>
        </div>
        <p className="tagline">
          Peer-to-peer encrypted file transfer · No servers · No limits
        </p>
      </header>

      <main className="main-grid">
        <ConnectionPanel
          peerId={peerId}
          connectionState={connectionState}
          isInitiator={isInitiator}
          error={error}
          onCreateRoom={createRoom}
          onJoinRoom={joinRoom}
          onDisconnect={disconnect}
        />

        <div className="transfer-panel">
          <div className="glass-card">
            <h2 className="section-title">
              <span className="icon">📁</span> File Transfer
            </h2>

            <FileDropZone
              onFilesSelected={handleFilesSelected}
              disabled={!isConnected || !isReady}
            />
          </div>

          <div className="glass-card">
            <h2 className="section-title">
              <span className="icon">📊</span> Transfers
            </h2>
            <TransferList
              transfers={transfers}
              receivedFiles={receivedFiles}
              onCancel={cancelTransfer}
              onDownload={downloadFile}
            />
          </div>
        </div>
      </main>

      <footer className="footer">
        <p>
          Files are transferred directly between browsers via WebRTC.
          <br />
          No data ever touches a server. 🔐
        </p>
      </footer>
    </div>
  );
}

export default App;
