const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// ── State ────────────────────────────────────────────────────────────────────

const rooms = new Map();   // roomId → { users: Map<userId, user>, revealed: bool }
const clients = new Map(); // ws → { roomId, userId }

function makeRoom() {
  return { users: new Map(), revealed: false };
}

function roomId6() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function userId4() {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

function publicUser(user, revealed) {
  return {
    id: user.id,
    name: user.name,
    hasVote: user.vote !== null,
    vote: revealed ? user.vote : null,
  };
}

function roomSnapshot(room) {
  return {
    revealed: room.revealed,
    users: [...room.users.values()].map(u => publicUser(u, room.revealed)),
  };
}

function broadcast(roomId, msg, excludeWs = null) {
  const raw = JSON.stringify(msg);
  for (const [ws, info] of clients) {
    if (info.roomId === roomId && ws !== excludeWs && ws.readyState === 1) {
      ws.send(raw);
    }
  }
}

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

// ── WebSocket handlers ────────────────────────────────────────────────────────

wss.on('connection', ws => {
  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const { type, payload = {} } = msg;

    if (type === 'join') {
      const roomId = (payload.roomId || roomId6()).toUpperCase();
      const userId = userId4();
      const name = (payload.name || 'Anonymous').slice(0, 24);

      if (!rooms.has(roomId)) rooms.set(roomId, makeRoom());
      const room = rooms.get(roomId);
      room.users.set(userId, { id: userId, name, vote: null });
      clients.set(ws, { roomId, userId });

      send(ws, { type: 'welcome', payload: { userId, roomId, state: roomSnapshot(room) } });
      broadcast(roomId, { type: 'user_joined', payload: { userId, name, state: roomSnapshot(room) } }, ws);
      // console.log(`[${roomId}] + ${name}`);
    }

    else if (type === 'vote') {
      const info = clients.get(ws);
      if (!info) return;
      const room = rooms.get(info.roomId);
      if (!room) return;
      const user = room.users.get(info.userId);
      if (!user) return;

      user.vote = payload.vote ?? null;
      const snap = roomSnapshot(room);
      const msgType = room.revealed ? 'vote_updated' : 'vote_cast';

      broadcast(info.roomId, { type: msgType, payload: { userId: info.userId, state: snap } });
      send(ws, { type: msgType, payload: { userId: info.userId, state: snap } });
    }

    else if (type === 'reveal') {
      const info = clients.get(ws);
      if (!info) return;
      const room = rooms.get(info.roomId);
      if (!room) return;

      room.revealed = true;
      const snap = roomSnapshot(room);
      broadcast(info.roomId, { type: 'revealed', payload: { state: snap } });
      send(ws, { type: 'revealed', payload: { state: snap } });
    }

    else if (type === 'clear') {
      const info = clients.get(ws);
      if (!info) return;
      const room = rooms.get(info.roomId);
      if (!room) return;

      room.revealed = false;
      for (const u of room.users.values()) u.vote = null;
      const snap = roomSnapshot(room);
      broadcast(info.roomId, { type: 'cleared', payload: { state: snap } });
      send(ws, { type: 'cleared', payload: { state: snap } });
    }
  });

  ws.on('close', () => {
    const info = clients.get(ws);
    if (!info) return;
    const room = rooms.get(info.roomId);
    if (room) {
      const user = room.users.get(info.userId);
      const name = user?.name ?? '?';
      room.users.delete(info.userId);
      if (room.users.size === 0) {
        rooms.delete(info.roomId);
      } else {
        broadcast(info.roomId, {
          type: 'user_left',
          payload: { userId: info.userId, name, state: roomSnapshot(room) },
        });
      }
    }
    clients.delete(ws);
  });
});

server.listen(PORT, () => console.log(`🃏  http://localhost:${PORT}`));
