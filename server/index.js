const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  // Increase limits for 50+ users
  maxHttpBufferSize: 1e7,
  pingTimeout: 60000,
  pingInterval: 25000,
});

// rooms: { roomId: { users: Map<socketId, { name, socketId }> } }
const rooms = new Map();

function getRoomUsers(roomId) {
  if (!rooms.has(roomId)) return [];
  return Array.from(rooms.get(roomId).users.values());
}

io.on('connection', (socket) => {
  console.log(`[connect] ${socket.id}`);

  // ─── Join Room ───────────────────────────────────────────────────────────
  socket.on('join-room', ({ roomId, userName }) => {
    if (!roomId || !userName) return;

    // Leave any previous room
    socket.rooms.forEach((r) => {
      if (r !== socket.id) {
        leaveRoom(socket, r);
      }
    });

    // Create room if it doesn't exist
    if (!rooms.has(roomId)) {
      rooms.set(roomId, { users: new Map() });
    }

    const room = rooms.get(roomId);
    const userInfo = { socketId: socket.id, name: userName };
    room.users.set(socket.id, userInfo);
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.userName = userName;

    // Send existing users to the new joiner
    const existingUsers = getRoomUsers(roomId).filter((u) => u.socketId !== socket.id);
    socket.emit('room-users', existingUsers);

    // Notify existing users about the new participant
    socket.to(roomId).emit('user-joined', userInfo);

    console.log(`[join] ${userName} (${socket.id}) → room ${roomId} | total: ${room.users.size}`);
  });

  // ─── WebRTC Signaling ─────────────────────────────────────────────────────
  socket.on('offer', ({ targetId, sdp }) => {
    io.to(targetId).emit('offer', {
      sdp,
      fromId: socket.id,
      fromName: socket.data.userName,
    });
  });

  socket.on('answer', ({ targetId, sdp }) => {
    io.to(targetId).emit('answer', { sdp, fromId: socket.id });
  });

  socket.on('ice-candidate', ({ targetId, candidate }) => {
    io.to(targetId).emit('ice-candidate', { candidate, fromId: socket.id });
  });

  // ─── Chat ─────────────────────────────────────────────────────────────────
  socket.on('chat-message', ({ message }) => {
    const roomId = socket.data.roomId;
    if (!roomId || !message) return;
    io.to(roomId).emit('chat-message', {
      fromId: socket.id,
      fromName: socket.data.userName,
      message,
      timestamp: Date.now(),
    });
  });

  // ─── Media State ──────────────────────────────────────────────────────────
  socket.on('media-state', ({ video, audio }) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    socket.to(roomId).emit('peer-media-state', {
      peerId: socket.id,
      video,
      audio,
    });
  });

  // ─── Disconnect ───────────────────────────────────────────────────────────
  socket.on('disconnecting', () => {
    socket.rooms.forEach((r) => {
      if (r !== socket.id) leaveRoom(socket, r);
    });
  });

  socket.on('disconnect', () => {
    console.log(`[disconnect] ${socket.id}`);
  });
});

function leaveRoom(socket, roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.users.delete(socket.id);
  socket.to(roomId).emit('user-left', { socketId: socket.id });
  if (room.users.size === 0) {
    rooms.delete(roomId);
    console.log(`[room-deleted] ${roomId}`);
  }
  console.log(`[leave] ${socket.id} ← room ${roomId}`);
}

// ─── Health check ─────────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ ok: true, rooms: rooms.size }));
app.get('/room/:id', (req, res) => {
  const room = rooms.get(req.params.id);
  res.json({ users: room ? getRoomUsers(req.params.id) : [] });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Signaling server running on :${PORT}`));
