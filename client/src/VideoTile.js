import React, { useEffect, useRef } from 'react';

export default function VideoTile({ stream, name, muted = false, isLocal = false, videoOn, audioOn }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="video-tile" data-local={isLocal}>
      <div className="video-wrap">
        {stream && videoOn ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={muted}
            className="tile-video"
          />
        ) : (
          <div className="tile-avatar">
            <span>{name?.[0]?.toUpperCase() || '?'}</span>
          </div>
        )}
        <div className="tile-overlay">
          <span className="tile-name">
            {isLocal ? `${name} (You)` : name}
          </span>
          <div className="tile-indicators">
            {!audioOn && (
              <span className="indicator muted" title="Muted">
                <MicOffIcon />
              </span>
            )}
            {!videoOn && (
              <span className="indicator cam-off" title="Camera off">
                <CamOffIcon />
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MicOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
      <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function CamOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}
