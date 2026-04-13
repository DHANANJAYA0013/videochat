# Novu — Live Video Sessions

A production-ready WebRTC video conferencing application supporting 50+ users per room, with real-time chat, media controls, and a beautiful dark UI.

## Tech Stack

| Layer | Technology |
|---|---|
| Signaling Server | Node.js + Socket.IO |
| Frontend | React 18 |
| Video/Audio | WebRTC (native browser API) |
| Real-time Chat | Socket.IO events |
| Styling | CSS Variables + custom design system |

## Architecture

```
Browser A ──┐                    ┌── Browser B
            │  WebRTC (P2P mesh) │
Browser C ──┤                    ├── Browser D
            │                    │
            └── Signaling Server ┘
               (Socket.IO / Node)
               Handles: join, offer, answer, ICE, chat
```

For 50+ users, each peer forms a direct WebRTC connection to every other peer (full mesh). The signaling server only routes connection metadata — actual media streams are peer-to-peer, offloading bandwidth from the server.

## Features

- ✅ **Video & Audio** — Real browser camera/mic via getUserMedia
- ✅ **50+ user rooms** — Full mesh WebRTC, ICE candidate queuing, reconnect handling
- ✅ **Media controls** — Toggle camera and microphone during session
- ✅ **Live camera indicators** — See who has mic/camera off in real-time
- ✅ **Real-time chat** — In-room messaging with timestamps
- ✅ **Unread badge** — Unread message count when chat is closed
- ✅ **Grid & Spotlight layouts** — Click any tile to spotlight a user
- ✅ **STUN/TURN** — Public STUN + free TURN relay for NAT traversal
- ✅ **Room ID sharing** — Click to copy room ID
- ✅ **Avatar fallback** — Shows initial letter when camera is off

## Quick Start

### Prerequisites
- Node.js 18+
- npm 9+
- Modern browser with WebRTC support (Chrome, Firefox, Edge, Safari)

### 1. Install Dependencies

```bash
# From the project root
npm run install:all
```

Or manually:
```bash
cd server && npm install
cd ../client && npm install
```

### 2. Start the Signaling Server

```bash
cd server
node index.js
# Listening on http://localhost:3001
```

### 3. Start the React Client

```bash
cd client
npm start
# Opens http://localhost:3000
```

### 4. Use the App

1. Open `http://localhost:3000` in your browser
2. Enter your name and a Room ID (or click 🎲 to generate one)
3. Click **Join Session**
4. Share the Room ID with others to invite them
5. Use the bottom controls to toggle mic/camera or open chat

## Production Deployment

### Environment Variables

**Client** — create `client/.env`:
```
REACT_APP_SERVER_URL=https://your-signaling-server.com
```

**Server** — optional:
```
PORT=3001
```

### Build the Client

```bash
cd client
npm run build
# Output in client/build/ — deploy to any static host (Vercel, Netlify, S3)
```

### Deploy the Server

The signaling server is a plain Node.js HTTP + Socket.IO server. Deploy to:
- **Railway** / **Render** / **Fly.io** — push `server/` directory
- **Heroku** — add Procfile: `web: node index.js`
- **VPS/EC2** — run with PM2: `pm2 start server/index.js`

### TURN Server for Production

The free `openrelay.metered.ca` TURN server is for development only. For production, get a dedicated TURN server:
- **Metered.ca** — Free tier + paid plans
- **Twilio NTS** — Reliable, usage-based pricing
- **Coturn** — Self-hosted open source

Update ICE servers in `client/src/usePeerConnections.js`:
```js
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    {
      urls: 'turn:your-turn-server.com:3478',
      username: 'your-username',
      credential: 'your-password',
    },
  ],
};
```

## Scaling Beyond 50 Users

The current full-mesh architecture works well for up to ~50 users. Each user opens N-1 peer connections where N = room size.

For 100+ users, consider a **Selective Forwarding Unit (SFU)**:
- [mediasoup](https://mediasoup.org/) — Node.js SFU, self-hosted
- [Janus Gateway](https://janus.conf.meetecho.com/) — C-based SFU
- [LiveKit](https://livekit.io/) — Managed SFU with open-source server

With an SFU, each peer only opens 1 connection to the server instead of N-1.

## Project Structure

```
novu-videochat/
├── server/
│   ├── index.js          # Socket.IO signaling server
│   └── package.json
├── client/
│   ├── public/
│   │   └── index.html
│   ├── src/
│   │   ├── App.js              # Main app (Lobby + Room)
│   │   ├── App.css             # Full design system
│   │   ├── usePeerConnections.js  # WebRTC peer manager hook
│   │   ├── VideoTile.js        # Individual video tile
│   │   ├── ChatPanel.js        # Chat sidebar
│   │   └── index.js            # React entry
│   └── package.json
├── package.json          # Root scripts
└── README.md
```

## Socket.IO Event Reference

| Event | Direction | Payload | Description |
|---|---|---|---|
| `join-room` | client→server | `{ roomId, userName }` | Join a room |
| `room-users` | server→client | `User[]` | Existing users on join |
| `user-joined` | server→client | `{ socketId, name }` | New user notification |
| `user-left` | server→client | `{ socketId }` | User disconnect |
| `offer` | client→server | `{ targetId, sdp }` | WebRTC offer |
| `answer` | client→server | `{ targetId, sdp }` | WebRTC answer |
| `ice-candidate` | client→server | `{ targetId, candidate }` | ICE candidate |
| `chat-message` | bidirectional | `{ message }` / `{ fromId, fromName, message, timestamp }` | Chat |
| `media-state` | client→server | `{ video, audio }` | Toggle notification |
| `peer-media-state` | server→client | `{ peerId, video, audio }` | Broadcast media state |
