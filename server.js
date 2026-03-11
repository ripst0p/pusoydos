const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const fs = require('fs');

app.use(express.static('public'));

// --- LEADERBOARD & DATABASE LOGIC ---
let leaderboard = {};
const DB_FILE = 'leaderboard.json';

// Load existing data if the server restarts
try { 
    if(fs.existsSync(DB_FILE)) leaderboard = JSON.parse(fs.readFileSync(DB_FILE)); 
} catch(e) { console.error("Error reading database", e); }

function saveDB() { fs.writeFileSync(DB_FILE, JSON.stringify(leaderboard)); }

io.on('connection', (socket) => {
    
    // 1. Silent Login & Registration
    socket.on('login', (data) => {
        let { id, name, color } = data;
        name = name.trim() || "Player";
        
        if (id && leaderboard[id]) {
            leaderboard[id].color = color; 
            saveDB();
            socket.emit('loginSuccess', leaderboard[id]);
        } else {
            id = Math.random().toString(36).substr(2, 9);
            let count = Object.values(leaderboard).filter(p => p.originalName === name).length;
            let displayName = count === 0 ? name : `${name} (${count})`;
            
            leaderboard[id] = { id, originalName: name, displayName, color, wins: 0 };
            saveDB();
            socket.emit('loginSuccess', leaderboard[id]);
        }
    });

    // 2. Leaderboard Retrieval
    socket.on('getLeaderboard', () => {
        let topPlayers = Object.values(leaderboard).sort((a,b) => b.wins - a.wins).slice(0, 10);
        socket.emit('leaderboardData', topPlayers);
    });

    // 3. Win Tracking
    socket.on('recordWin', (playerId) => {
        if(leaderboard[playerId]) {
            leaderboard[playerId].wins++;
            saveDB();
            io.emit('leaderboardData', Object.values(leaderboard).sort((a,b) => b.wins - a.wins).slice(0, 10));
        }
    });

    // --- STANDARD GAME ROOM LOGIC ---
    socket.on('createRoom', ({ roomId }) => { socket.join(roomId); socket.roomId = roomId; socket.emit('roomCreated', roomId); });
    socket.on('joinRoom', (data) => { socket.roomId = data.roomId; socket.join(data.roomId); socket.to(data.roomId).emit('requestJoin', { socketId: socket.id, ...data }); });
    socket.on('joinAccepted', ({ targetSocketId, roomId, gameState }) => { io.to(targetSocketId).emit('gameJoined', { roomId, gameState }); });
    socket.on('joinRejected', ({ targetSocketId, reason }) => { io.to(targetSocketId).emit('errorMsg', reason); });
    socket.on('syncGameState', ({ roomId, state }) => { socket.to(roomId).emit('gameStateUpdated', state); });
    socket.on('playerMove', ({ roomId, moveData }) => { socket.to(roomId).emit('processClientMove', moveData); });
    socket.on('sendChat', (data) => { io.to(data.roomId).emit('receiveChat', data); });
    socket.on('leaveRoom', () => { if(socket.roomId) { socket.to(socket.roomId).emit('playerLeft', socket.id); socket.leave(socket.roomId); socket.roomId = null; } });
    socket.on('disconnect', () => { if(socket.roomId) socket.to(socket.roomId).emit('playerLeft', socket.id); });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server running on port ${PORT}`));
