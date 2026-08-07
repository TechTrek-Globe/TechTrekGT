import React, { useEffect, useRef, useState, useCallback } from 'react';
import Guacamole from 'guacamole-common-js';
import { useAuth } from '../context/AuthContext';
import {
  Monitor,
  LogOut,
  Wifi,
  WifiOff,
  Maximize2,
  RotateCcw,
  Terminal,
  AlertTriangle,
  Loader2,
  ChevronDown
} from 'lucide-react';

// Connection state machine
const STATE = {
  IDLE:        'idle',
  FETCHING:    'fetching_token',
  CONNECTING:  'connecting',
  CONNECTED:   'connected',
  DISCONNECTED:'disconnected',
  ERROR:       'error',
};

export function GuacamoleView() {
  const { user, logout } = useAuth();
  const displayRef = useRef(null);
  const clientRef  = useRef(null);
  const sinkRef    = useRef(null);

  const [connState, setConnState] = useState(STATE.IDLE);
  const [errorMsg,  setErrorMsg]  = useState('');
  const [iframeUrl, setIframeUrl] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const controlsTimerRef = useRef(null);

  // Auto-hide controls after 3s of mouse inactivity in connected state
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    clearTimeout(controlsTimerRef.current);
    if (connState === STATE.CONNECTED) {
      controlsTimerRef.current = setTimeout(() => setShowControls(false), 3000);
    }
  }, [connState]);

  useEffect(() => {
    window.addEventListener('mousemove', resetControlsTimer, { passive: true });
    return () => {
      window.removeEventListener('mousemove', resetControlsTimer);
      clearTimeout(controlsTimerRef.current);
    };
  }, [resetControlsTimer]);

  const disconnect = useCallback(() => {
    setIframeUrl('');
    if (clientRef.current) {
      try { clientRef.current.disconnect(); } catch (e) { /* ignore */ }
      clientRef.current = null;
    }
    if (displayRef.current) {
      displayRef.current.innerHTML = '';
    }
    setConnState(STATE.DISCONNECTED);
  }, []);

  const connect = useCallback(async () => {
    disconnect();
    setConnState(STATE.FETCHING);
    setErrorMsg('');

    let guacToken, connectionId;

    // Step 1: Get Guacamole auth token from Worker (JWT-gated)
    try {
      const res = await fetch('/api/guac-token', { credentials: 'include' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Token fetch failed (${res.status})`);
      }
      const data = await res.json();
      guacToken    = data.guacToken;
      connectionId = data.connectionId;
    } catch (err) {
      setConnState(STATE.ERROR);
      setErrorMsg(err.message || 'Could not reach Guacamole service. Is the Cloudflare Tunnel running?');
      return;
    }

    if (!connectionId) {
      setConnState(STATE.ERROR);
      setErrorMsg('No remote desktop connections found in Guacamole. Check user-mapping.xml.');
      return;
    }

    setConnState(STATE.CONNECTING);

    try {
      const idBase64 = btoa(`${connectionId}\0c\0default`);
      const fullUrl = `/tunnel/#/client/${encodeURIComponent(idBase64)}?token=${encodeURIComponent(guacToken)}`;
      setIframeUrl(fullUrl);
      setConnState(STATE.CONNECTED);
    } catch (err) {
      setConnState(STATE.ERROR);
      setErrorMsg('Failed to open remote desktop interface.');
    }

    // Scale display to fit container
    const fitDisplay = () => {
      if (!displayRef.current || !client) return;
      const containerW = displayRef.current.offsetWidth;
      const containerH = displayRef.current.offsetHeight;
      const remoteW = client.getDisplay().getWidth();
      const remoteH = client.getDisplay().getHeight();
      if (remoteW && remoteH) {
        const scale = Math.min(containerW / remoteW, containerH / remoteH);
        client.getDisplay().scale(scale);
      }
    };

    const resizeObs = new ResizeObserver(fitDisplay);
    resizeObs.observe(displayRef.current);

    // Client state change handler
    client.onstatechange = (state) => {
      switch (state) {
        case Guacamole.Client.State.CONNECTED:
          setConnState(STATE.CONNECTED);
          fitDisplay();
          break;
        case Guacamole.Client.State.DISCONNECTED:
          setConnState(STATE.DISCONNECTED);
          resizeObs.disconnect();
          break;
        default:
          break;
      }
    };

    client.onerror = (err) => {
      setConnState(STATE.ERROR);
      setErrorMsg(err?.message || 'Remote desktop connection error. Check Guacamole logs.');
      resizeObs.disconnect();
    };

    // Keyboard input - route to Guacamole
    const keyboard = new Guacamole.Keyboard(document);
    keyboard.onkeydown = (keysym) => client.sendKeyEvent(1, keysym);
    keyboard.onkeyup   = (keysym) => client.sendKeyEvent(0, keysym);

    // Mouse input - route to Guacamole
    const mouse = new Guacamole.Mouse(displayEl);
    mouse.onEach(['mousedown','mouseup','mousemove'], (e) => {
      client.sendMouseState(mouse.currentState);
      e.preventDefault();
    });

    // Audio sink
    const audioMimes = Guacamole.AudioPlayer.getSupportedTypes();
    if (audioMimes.length) {
      sinkRef.current = new Guacamole.AudioPlayer.getInstance(client, audioMimes[0]);
    }

    // Connect with Guacamole token + connection ID
    // Protocol: c=<connectionId>,dataSource=default
    client.connect(
      `token=${encodeURIComponent(guacToken)}` +
      `&GUAC_ID=${encodeURIComponent(connectionId)}` +
      `&GUAC_DATA_SOURCE=default` +
      `&GUAC_TYPE=c`
    );
  }, [disconnect]);

  // Auto-connect on mount
  useEffect(() => {
    connect();
    return () => disconnect();
  }, []);

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      displayRef.current?.parentElement?.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  };

  const isConnecting = connState === STATE.FETCHING || connState === STATE.CONNECTING;

  return (
    <div
      className="min-h-screen bg-slate-950 flex flex-col font-sans"
      onMouseMove={resetControlsTimer}
    >
      {/* Top controls bar - auto-hides when connected */}
      <header
        className={`flex items-center justify-between px-4 py-2 bg-slate-900/95 border-b border-slate-800/60 backdrop-blur-md z-20 transition-all duration-300 ${
          connState === STATE.CONNECTED && !showControls
            ? 'opacity-0 -translate-y-full pointer-events-none'
            : 'opacity-100 translate-y-0'
        }`}
        style={{ position: 'sticky', top: 0 }}
      >
        {/* Left: Brand + connection state */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-black text-white">Big<span className="text-cyan-400">Worm</span></span>
          </div>
          <div className="h-4 w-px bg-slate-700" />
          <div className="flex items-center gap-1.5">
            {connState === STATE.CONNECTED && <div className="status-dot-live" />}
            {isConnecting                   && <div className="status-dot-connecting" />}
            {connState === STATE.ERROR      && <div className="status-dot-error" />}
            {connState === STATE.DISCONNECTED && <div className="w-2 h-2 rounded-full bg-slate-600" />}
            <span className="text-xs font-mono text-slate-400">
              {connState === STATE.CONNECTED   && 'Connected - Home Laptop'}
              {connState === STATE.FETCHING    && 'Authenticating...'}
              {connState === STATE.CONNECTING  && 'Establishing session...'}
              {connState === STATE.DISCONNECTED && 'Disconnected'}
              {connState === STATE.ERROR       && 'Connection failed'}
            </span>
          </div>
        </div>

        {/* Right: Controls */}
        <div className="flex items-center gap-2">
          <button
            id="bw-reconnect-btn"
            onClick={connect}
            disabled={isConnecting}
            title="Reconnect"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-cyan-400 hover:bg-slate-800/60 border border-transparent hover:border-slate-700/60 transition-all disabled:opacity-40"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isConnecting ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Reconnect</span>
          </button>
          <button
            id="bw-fullscreen-btn"
            onClick={toggleFullscreen}
            title="Toggle fullscreen"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-cyan-400 hover:bg-slate-800/60 border border-transparent hover:border-slate-700/60 transition-all"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Fullscreen</span>
          </button>
          <div className="h-4 w-px bg-slate-700 mx-1" />
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-slate-800/40 border border-slate-700/40">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-cyan-500/20 to-blue-600/10 border border-cyan-500/20 flex items-center justify-center">
              <span className="text-[10px] font-black text-cyan-400">
                {user?.name?.charAt(0)?.toUpperCase() || '?'}
              </span>
            </div>
            <span className="text-xs text-slate-400 hidden sm:block">{user?.name || 'User'}</span>
          </div>
          <button
            id="bw-logout-btn"
            onClick={logout}
            title="Sign out"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-red-400 hover:bg-red-900/20 border border-transparent hover:border-red-900/30 transition-all"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 relative bg-black overflow-hidden">

        {/* Guacamole display container / iframe */}
        {iframeUrl ? (
          <iframe
            src={iframeUrl}
            className="w-full h-full border-0"
            title="Guacamole Remote Desktop"
            allow="fullscreen; clipboard-read; clipboard-write"
          />
        ) : (
          <div
            id="guac-display"
            ref={displayRef}
            className={`absolute inset-0 ${connState === STATE.CONNECTED || connState === STATE.CONNECTING ? 'block' : 'hidden'}`}
          />
        )}

        {/* Overlay states */}
        {connState !== STATE.CONNECTED && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950 bg-grid-cyber">

            {/* Error state */}
            {connState === STATE.ERROR && (
              <div className="flex flex-col items-center gap-5 max-w-sm text-center px-6 animate-fade-in">
                <div className="w-14 h-14 rounded-2xl bg-red-950/50 border border-red-800/40 flex items-center justify-center">
                  <AlertTriangle className="w-7 h-7 text-red-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white mb-1">Connection Failed</h3>
                  <p className="text-xs text-slate-400 leading-relaxed font-mono">{errorMsg}</p>
                </div>
                <div className="glass-card rounded-xl p-3 border border-slate-800/60 text-left w-full">
                  <p className="text-[10px] font-mono text-slate-500 mb-1.5">Troubleshooting checklist:</p>
                  {[
                    'Docker Desktop is running on home laptop',
                    'cloudflared tunnel service is running',
                    'Guacamole responds at localhost:8080',
                    'GUACAMOLE_INTERNAL_URL Worker secret is set',
                  ].map(tip => (
                    <p key={tip} className="text-[10px] font-mono text-slate-600 flex gap-2">
                      <span className="text-cyan-600">-</span>{tip}
                    </p>
                  ))}
                </div>
                <button
                  id="bw-retry-btn"
                  onClick={connect}
                  className="btn-primary w-auto px-6"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Retry Connection
                </button>
              </div>
            )}

            {/* Connecting / fetching state */}
            {isConnecting && (
              <div className="flex flex-col items-center gap-4 animate-fade-in">
                <div className="relative">
                  <div className="w-14 h-14 rounded-2xl bg-cyan-950/40 border border-cyan-800/30 flex items-center justify-center">
                    <Monitor className="w-7 h-7 text-cyan-500/60" />
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-slate-950 flex items-center justify-center">
                    <Loader2 className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-white mb-1">
                    {connState === STATE.FETCHING ? 'Authenticating...' : 'Opening Remote Session...'}
                  </p>
                  <p className="text-xs font-mono text-slate-500">
                    {connState === STATE.FETCHING
                      ? 'Exchanging credentials with Guacamole'
                      : 'Establishing RDP connection to home laptop'}
                  </p>
                </div>
              </div>
            )}

            {/* Idle / disconnected state */}
            {(connState === STATE.IDLE || connState === STATE.DISCONNECTED) && (
              <div className="flex flex-col items-center gap-5 animate-fade-in">
                <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center">
                  {connState === STATE.DISCONNECTED
                    ? <WifiOff className="w-7 h-7 text-slate-600" />
                    : <Wifi className="w-7 h-7 text-slate-600" />
                  }
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-white mb-1">
                    {connState === STATE.DISCONNECTED ? 'Session Ended' : 'Ready to Connect'}
                  </p>
                  <p className="text-xs font-mono text-slate-500">Home Laptop Remote Desktop</p>
                </div>
                <button id="bw-connect-btn" onClick={connect} className="btn-primary w-auto px-8">
                  <Monitor className="w-4 h-4" />
                  Connect to Home Laptop
                </button>
              </div>
            )}

          </div>
        )}

        {/* Show controls hint when connected + controls hidden */}
        {connState === STATE.CONNECTED && !showControls && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
            <div className="flex items-center gap-1 px-3 py-1 rounded-full bg-black/50 border border-slate-700/30 backdrop-blur-sm">
              <ChevronDown className="w-3 h-3 text-slate-500" />
              <span className="text-[10px] font-mono text-slate-500">Move mouse to show controls</span>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
