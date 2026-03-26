const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// In-memory data
const rooms = new Map();

// Serve all static files (HTML, CSS, JS) from the 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// Serve canvas-confetti from node_modules
app.use('/modules/canvas-confetti', express.static(path.join(__dirname, 'node_modules/canvas-confetti/dist/confetti.browser.js')));

io.on('connection', (socket) => {
    socket.on('join-room', ({ roomId, username }) => {
        socket.join(roomId);
        if (!rooms.has(roomId)) rooms.set(roomId, { users: {}, showVotes: false });
        
        const room = rooms.get(roomId);
        room.users[socket.id] = { username, vote: null };
        io.to(roomId).emit('room-update', room);
    });

    socket.on('submit-vote', ({ roomId, vote }) => {
        const room = rooms.get(roomId);
        if (room) {
            room.users[socket.id].vote = vote;
            io.to(roomId).emit('room-update', room);
        }
    });

    socket.on('reveal-votes', (roomId) => {
        const room = rooms.get(roomId);
        if (room) {
            let numOfVotes = Object.values(room.users).filter(u => u.vote != null).length;
            room.showVotes = numOfVotes > 0;
            io.to(roomId).emit('room-update', room);
        }
    });

    socket.on('reset-room', (roomId) => {
        const room = rooms.get(roomId);
        if (room) {
            room.showVotes = false;
            Object.values(room.users).forEach(user => user.vote = null);
            io.to(roomId).emit('room-update', room);
        }
    });

    socket.on('disconnect', () => {
        rooms.forEach((room, roomId) => {
            if (room.users[socket.id]) {
                delete room.users[socket.id];
                if (Object.keys(room.users).length === 0) rooms.delete(roomId);
                else io.to(roomId).emit('room-update', room);
            }
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server: http://localhost:${PORT}`));