const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve the 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

const rooms = {}; 
const socketToRoom = {}; 

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    socket.on('createRoom', ({ roomId }) => {
        rooms[roomId] = { host: socket.id };
        socketToRoom[socket.id] = roomId;
        socket.join(roomId);
        socket.emit('roomCreated', roomId);
    });

    socket.on('joinRoom', ({ roomId, playerName, playerColor }) => {
        if (rooms[roomId]) {
            io.to(rooms[roomId].host).emit('requestJoin', {
                socketId: socket.id,
                name: playerName,
                color: playerColor
            });
        } else {
            socket.emit('errorMsg', 'VIP Room does not exist or is closed.');
        }
    });

    socket.on('joinAccepted', ({ targetSocketId, roomId, gameState }) => {
        const targetSocket = io.sockets.sockets.get(targetSocketId);
        if (targetSocket) {
            targetSocket.join(roomId);
            socketToRoom[targetSocketId] = roomId;
            targetSocket.emit('gameJoined', { roomId, gameState });
            socket.to(roomId).emit('gameStateUpdated', gameState);
        }
    });

    socket.on('joinRejected', ({ targetSocketId, reason }) => {
        io.to(targetSocketId).emit('errorMsg', reason);
    });

    socket.on('syncGameState', ({ roomId, state }) => {
        socket.to(roomId).emit('gameStateUpdated', state);
    });

    socket.on('playerMove', ({ roomId, moveData }) => {
        if(rooms[roomId]) io.to(rooms[roomId].host).emit('processClientMove', moveData);
    });

    socket.on('sendChat', ({ roomId, name, msg, color }) => {
        io.to(roomId).emit('receiveChat', { name, msg, color });
    });

    const handleLeave = (socketId) => {
        const roomId = socketToRoom[socketId];
        if (roomId && rooms[roomId]) {
            if (rooms[roomId].host === socketId) {
                socket.to(roomId).emit('hostLeft');
                delete rooms[roomId];
            } else {
                io.to(rooms[roomId].host).emit('playerLeft', socketId);
            }
        }
        delete socketToRoom[socketId];
    };

    socket.on('leaveRoom', () => {
        handleLeave(socket.id);
        socket.leave(socketToRoom[socket.id]);
    });

    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        handleLeave(socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Casino Open on http://localhost:${PORT}`));