import React, { useState, useRef, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import { usePeerConnections } from './usePeerConnections';
import VideoTile from './VideoTile';
import ChatPanel from './ChatPanel';
import './App.css';

const SIGNAL_SERVER = process.env.REACT_APP_SERVER_URL || 'http://localhost:3001';

// ─── Lobby ────────────────────────────────────────────────────────────────────
function Lobby({ onJoin }) {
  const [name, setName] = useState('');
  const [room, setRoom] = useState('');
  const [err, setErr] = useState('');

  const handleSubmit = () => {
    if (!name.trim()) return setErr('Enter your name');
    if (!room.trim()) return setErr('Enter a room ID');
    setErr('');
    onJoin(name.trim(), room.trim());
  };

  const randomRoom = () => setRoom(Math.random().toString(36).slice(2, 8).toUpperCase());

  return (
    <div className="lobby">
      <div className="lobby-bg">
        <div className="bg-orb orb1" />
        <div className="bg-orb orb2" />
        <div className="bg-orb orb3" />
        <div className="grid-lines" />
      </div>

      <div className="lobby-card">
        <div className="lobby-logo">
          <div className="logo-mark">
            <span />
            <span />
            <span />
          </div>
          <h1>NOVU</h1>
        </div>
        <p className="lobby-tagline">Live video sessions, no friction.</p>

        <div className="field-group">
          <label>YOUR NAME</label>
          <input
            className="field"
            placeholder="e.g. Alex Chen"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            autoFocus
          />
        </div>

        <div className="field-group">
          <label>ROOM ID</label>
          <div className="field-row">
            <input
              className="field"
              placeholder="e.g. ALPHA7"
              value={room}
              onChange={(e) => setRoom(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            />
            <button className="btn-ghost" onClick={randomRoom} title="Generate random room">
              <DiceIcon />
            </button>
          </div>
        </div>

        {err && <p className="lobby-err">{err}</p>}

        <button className="btn-primary" onClick={handleSubmit}>
          <span>Join Session</span>
          <ArrowIcon />
        </button>

        <p className="lobby-hint">New room ID = new room. Share the ID with others to join.</p>
      </div>
    </div>
  );
}

// ─── Room ─────────────────────────────────────────────────────────────────────
function Room({ userName, roomId, onLeave }) {
  const socketRef = useRef(null);
  const localStreamRef = useRef(null);

  const [localStream, setLocalStream] = useState(null);
  const [peers, setPeers] = useState({}); // { socketId: { name, stream, videoOn, audioOn } }
  const [messages, setMessages] = useState([]);
  const [mySocketId, setMySocketId] = useState('');
  const [videoOn, setVideoOn] = useState(true);
  const [audioOn, setAudioOn] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [layout, setLayout] = useState('grid'); // grid | spotlight
  const [spotlightId, setSpotlightId] = useState(null);

  // ── Peer state helpers ──
  const addPeer = useCallback((id, info) => {
    setPeers((prev) => ({ ...prev, [id]: { name: info.name, stream: null, videoOn: true, audioOn: true, ...prev[id] } }));
  }, []);

  const removePeer = useCallback((id) => {
    setPeers((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const setPeerStream = useCallback((id, stream) => {
    setPeers((prev) => ({
      ...prev,
      [id]: { ...prev[id], stream },
    }));
  }, []);

  const setPeerMedia = useCallback((id, { video, audio }) => {
    setPeers((prev) => ({
      ...prev,
      [id]: { ...prev[id], videoOn: video, audioOn: audio },
    }));
  }, []);

  // ── WebRTC ──
  const { makeOffer, handleOffer, handleAnswer, handleIceCandidate, replaceTrack, closeAll, closePC } =
    usePeerConnections({
      socketRef,
      localStreamRef,
      onRemoteStream: setPeerStream,
      onPeerLeft: removePeer,
    });

  // ── Init media & socket ──
  useEffect(() => {
    let cancelled = false;

    async function init() {
      // Get user media
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
          setVideoOn(false);
        } catch {
          stream = new MediaStream();
          setVideoOn(false);
          setAudioOn(false);
        }
      }

      if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }

      localStreamRef.current = stream;
      setLocalStream(stream);

      // Connect socket
      const socket = io(SIGNAL_SERVER, { transports: ['websocket'] });
      socketRef.current = socket;

      socket.on('connect', () => {
        setMySocketId(socket.id);
        socket.emit('join-room', { roomId, userName });
      });

      // Existing users → make offers
      socket.on('room-users', (users) => {
        users.forEach((u) => {
          addPeer(u.socketId, u);
          makeOffer(u.socketId);
        });
      });

      socket.on('user-joined', (u) => {
        addPeer(u.socketId, u);
        // Offer will come from their side; they'll send us an offer
      });

      socket.on('offer', (data) => {
        addPeer(data.fromId, { name: data.fromName });
        handleOffer(data);
      });

      socket.on('answer', handleAnswer);
      socket.on('ice-candidate', handleIceCandidate);

      socket.on('user-left', ({ socketId }) => {
        closePC(socketId);
        removePeer(socketId);
      });

      socket.on('chat-message', (msg) => {
        setMessages((prev) => [...prev, msg]);
        setChatOpen((open) => {
          if (!open) setUnread((n) => n + 1);
          return open;
        });
      });

      socket.on('peer-media-state', ({ peerId, video, audio }) => {
        setPeerMedia(peerId, { video, audio });
      });
    }

    init();

    return () => {
      cancelled = true;
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      closeAll();
      socketRef.current?.disconnect();
    };
    // eslint-disable-next-line
  }, []);

  // ── Media controls ──
  const toggleVideo = useCallback(async () => {
    const stream = localStreamRef.current;
    if (!stream) return;

    const newState = !videoOn;
    setVideoOn(newState);

    if (newState) {
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const newTrack = newStream.getVideoTracks()[0];
        // Remove old video tracks
        stream.getVideoTracks().forEach((t) => { t.stop(); stream.removeTrack(t); });
        stream.addTrack(newTrack);
        replaceTrack('video', newTrack);
        setLocalStream(new MediaStream(stream.getTracks()));
      } catch {}
    } else {
      stream.getVideoTracks().forEach((t) => { t.enabled = false; });
    }

    socketRef.current?.emit('media-state', { video: newState, audio: audioOn });
  }, [videoOn, audioOn, replaceTrack]);

  const toggleAudio = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const newState = !audioOn;
    setAudioOn(newState);
    stream.getAudioTracks().forEach((t) => { t.enabled = newState; });
    socketRef.current?.emit('media-state', { video: videoOn, audio: newState });
  }, [audioOn, videoOn]);

  const sendChat = useCallback((msg) => {
    socketRef.current?.emit('chat-message', { message: msg });
  }, []);

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId).then(() => {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    });
  };

  const openChat = () => {
    setChatOpen(true);
    setUnread(0);
  };

  const allParticipants = [
    { id: 'local', name: userName, stream: localStream, isLocal: true, videoOn, audioOn },
    ...Object.entries(peers).map(([id, p]) => ({ id, name: p.name, stream: p.stream, isLocal: false, videoOn: p.videoOn !== false, audioOn: p.audioOn !== false })),
  ];

  const spotlightUser = spotlightId ? allParticipants.find((p) => p.id === spotlightId) : null;
  const sidebarUsers = spotlightId ? allParticipants.filter((p) => p.id !== spotlightId) : [];

  return (
    <div className="room">
      {/* Header */}
      <header className="room-header">
        <div className="header-left">
          <div className="header-logo">NOVU</div>
          <div className="room-id-pill">
            <span>{roomId}</span>
            <button onClick={copyRoomId} className="copy-btn" title="Copy Room ID">
              {copyFeedback ? <CheckIcon /> : <CopyIcon />}
            </button>
          </div>
        </div>
        <div className="header-center">
          <span className="participant-count">
            <UsersIcon />
            {allParticipants.length} participant{allParticipants.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="header-right">
          <button
            className={`layout-btn ${layout === 'grid' ? 'active' : ''}`}
            onClick={() => { setLayout('grid'); setSpotlightId(null); }}
            title="Grid view"
          >
            <GridIcon />
          </button>
          <button
            className={`layout-btn ${layout === 'spotlight' ? 'active' : ''}`}
            onClick={() => { setLayout('spotlight'); if (!spotlightId) setSpotlightId('local'); }}
            title="Spotlight view"
          >
            <SpotlightIcon />
          </button>
        </div>
      </header>

      {/* Main Area */}
      <div className={`room-body ${chatOpen ? 'chat-visible' : ''}`}>
        <div className="video-area">
          {layout === 'grid' ? (
            <div className={`video-grid count-${Math.min(allParticipants.length, 12)}`}>
              {allParticipants.map((p) => (
                <div key={p.id} onClick={() => { setLayout('spotlight'); setSpotlightId(p.id); }} style={{ cursor: 'pointer' }}>
                  <VideoTile
                    stream={p.stream}
                    name={p.name}
                    muted={p.isLocal}
                    isLocal={p.isLocal}
                    videoOn={p.videoOn}
                    audioOn={p.audioOn}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="spotlight-layout">
              <div className="spotlight-main">
                {spotlightUser && (
                  <VideoTile
                    stream={spotlightUser.stream}
                    name={spotlightUser.name}
                    muted={spotlightUser.isLocal}
                    isLocal={spotlightUser.isLocal}
                    videoOn={spotlightUser.videoOn}
                    audioOn={spotlightUser.audioOn}
                  />
                )}
              </div>
              <div className="spotlight-strip">
                {sidebarUsers.map((p) => (
                  <div key={p.id} onClick={() => setSpotlightId(p.id)} style={{ cursor: 'pointer' }}>
                    <VideoTile
                      stream={p.stream}
                      name={p.name}
                      muted={p.isLocal}
                      isLocal={p.isLocal}
                      videoOn={p.videoOn}
                      audioOn={p.audioOn}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {chatOpen && (
          <div className="chat-sidebar">
            <button className="chat-close" onClick={() => setChatOpen(false)}>✕</button>
            <ChatPanel messages={messages} onSend={sendChat} mySocketId={mySocketId} />
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="controls">
        <button
          className={`ctrl-btn ${audioOn ? '' : 'off'}`}
          onClick={toggleAudio}
          title={audioOn ? 'Mute' : 'Unmute'}
        >
          {audioOn ? <MicIcon /> : <MicOffIcon />}
          <span>{audioOn ? 'Mute' : 'Unmute'}</span>
        </button>

        <button
          className={`ctrl-btn ${videoOn ? '' : 'off'}`}
          onClick={toggleVideo}
          title={videoOn ? 'Stop Camera' : 'Start Camera'}
        >
          {videoOn ? <CamIcon /> : <CamOffIcon />}
          <span>{videoOn ? 'Camera' : 'No Cam'}</span>
        </button>

        <button
          className={`ctrl-btn chat-ctrl ${unread > 0 ? 'has-unread' : ''}`}
          onClick={openChat}
          title="Chat"
        >
          <ChatIcon />
          <span>Chat</span>
          {unread > 0 && <span className="unread-badge">{unread}</span>}
        </button>

        <button className="ctrl-btn leave" onClick={onLeave} title="Leave room">
          <PhoneIcon />
          <span>Leave</span>
        </button>
      </div>
    </div>
  );
}

// ─── App Shell ─────────────────────────────────────────────────────────────────
export default function App() {
  const [session, setSession] = useState(null);

  return session ? (
    <Room userName={session.name} roomId={session.room} onLeave={() => setSession(null)} />
  ) : (
    <Lobby onJoin={(name, room) => setSession({ name, room })} />
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────
function DiceIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="2" width="20" height="20" rx="3" /><circle cx="8" cy="8" r="1.5" fill="currentColor" /><circle cx="16" cy="8" r="1.5" fill="currentColor" /><circle cx="12" cy="12" r="1.5" fill="currentColor" /><circle cx="8" cy="16" r="1.5" fill="currentColor" /><circle cx="16" cy="16" r="1.5" fill="currentColor" /></svg>;
}
function ArrowIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>;
}
function CopyIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>;
}
function CheckIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>;
}
function UsersIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
}
function GridIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>;
}
function SpotlightIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="3" width="15" height="18" rx="2" /><rect x="19" y="3" width="3" height="5" rx="1" /><rect x="19" y="10" width="3" height="5" rx="1" /><rect x="19" y="17" width="3" height="4" rx="1" /></svg>;
}
function MicIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>;
}
function MicOffIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="1" y1="1" x2="23" y2="23" /><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" /><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>;
}
function CamIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>;
}
function CamOffIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="1" y1="1" x2="23" y2="23" /><path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34" /><circle cx="12" cy="13" r="3" /></svg>;
}
function ChatIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;
}
function PhoneIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.42 19.42 0 0 1 3.07 8.63 19.79 19.79 0 0 1 0 0a2 2 0 0 1 2-2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L6.18 5.68" /><line x1="23" y1="1" x2="1" y2="23" /></svg>;
}
