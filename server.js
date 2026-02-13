const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const { GongZhuGame } = require('./game/GameLogic');

const { Bot, createBot } = require('./game/Bot');
const config = require('./config');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

// Serve static files
// Serve static files
app.use(express.static('public'));
app.use(express.json());

// Login Endpoint
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === config.USERNAME && password === config.PASSWORD) {
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
});

// Game rooms storage
const rooms = new Map();
const playerRooms = new Map();

// Helper function to broadcast game state
function broadcastGameState(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;

    for (const player of room.game.players) {
        const socket = io.sockets.sockets.get(player.socketId);
        if (socket) {
            socket.emit('gameState', room.game.getGameState(player.id));
        }
    }
}

// Helper function to handle bot turns
async function handleBotTurn(roomId) {
    const room = rooms.get(roomId);
    if (!room || room.game.gamePhase !== 'playing') return;

    const currentPlayer = room.game.players[room.game.currentPlayerIndex];
    if (!currentPlayer || !currentPlayer.isBot) return;

    // Add delay for bot thinking
    await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 700));

    const validCards = room.game.getValidCards(currentPlayer.id);
    const bot = currentPlayer;

    const gameState = {
        currentTrick: room.game.currentTrick,
        leadSuit: room.game.leadSuit,
        tricksTaken: room.game.tricksTaken
    };

    const chosenCard = bot.chooseCard ?
        bot.chooseCard(validCards, gameState) :
        validCards[Math.floor(Math.random() * validCards.length)];

    if (chosenCard) {
        const result = room.game.playCard(currentPlayer.id, chosenCard.id);

        io.to(roomId).emit('cardPlayed', {
            playerId: currentPlayer.id,
            card: chosenCard,
            result
        });

        broadcastGameState(roomId);

        if (result.trickComplete) {
            await new Promise(resolve => setTimeout(resolve, 1500));

            io.to(roomId).emit('trickComplete', {
                winner: result.trickWinner,
                cards: result.trickCards
            });

            if (result.roundOver) {
                io.to(roomId).emit('roundOver', {
                    scores: result.roundScores,
                    gameOver: result.gameOver
                });
                return;
            }
        }

        // Continue with next bot if needed
        handleBotTurn(roomId);
    }
}

io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    // Create a new room
    socket.on('createRoom', (playerData) => {
        const roomId = uuidv4().substring(0, 6).toUpperCase();
        const playerId = uuidv4();

        const player = {
            id: playerId,
            socketId: socket.id,
            name: playerData.name || 'Player 1',
            avatar: playerData.avatar || '😀',
            isBot: false,
            isHost: true
        };



        const targetScore = parseInt(playerData.targetScore) || -500;
        const game = new GongZhuGame(roomId, targetScore);
        game.addPlayer(player);

        rooms.set(roomId, { game, hostId: playerId });
        playerRooms.set(socket.id, { roomId, playerId });

        socket.join(roomId);
        socket.emit('roomCreated', { roomId, playerId, gameState: game.getGameState(playerId) });
    });

    // Join an existing room
    socket.on('joinRoom', ({ roomId, playerData }) => {
        // Enforce room code
        if (!roomId) {
            socket.emit('error', { message: 'Room code is required' });
            return;
        }

        const room = rooms.get(roomId);
        if (!room) {
            socket.emit('error', { message: 'Room not found' });
            return;
        }

        if (room.game.players.length >= 4) {
            socket.emit('error', { message: 'Room is full' });
            return;
        }

        if (room.game.gamePhase !== 'waiting') {
            socket.emit('error', { message: 'Game already in progress' });
            return;
        }

        const playerId = uuidv4();
        const player = {
            id: playerId,
            socketId: socket.id,
            name: playerData.name || `Player ${room.game.players.length + 1}`,
            avatar: playerData.avatar || '😀',
            isBot: false,
            isHost: false
        };

        room.game.addPlayer(player);
        playerRooms.set(socket.id, { roomId, playerId });

        socket.join(roomId);
        socket.emit('roomJoined', { roomId, playerId, gameState: room.game.getGameState(playerId) });

        // Notify others
        socket.to(roomId).emit('playerJoined', { player });
        broadcastGameState(roomId);
    });

    // Add a bot to the room
    socket.on('addBot', () => {
        const playerRoom = playerRooms.get(socket.id);
        if (!playerRoom) return;

        const room = rooms.get(playerRoom.roomId);
        if (!room) return;

        if (room.hostId !== playerRoom.playerId) {
            socket.emit('error', { message: 'Only host can add bots' });
            return;
        }

        if (room.game.players.length >= 4) {
            socket.emit('error', { message: 'Room is full' });
            return;
        }

        const bot = createBot(uuidv4());
        room.game.addPlayer(bot);

        io.to(playerRoom.roomId).emit('botAdded', { bot });
        broadcastGameState(playerRoom.roomId);
    });

    // Remove a bot from the room
    socket.on('removeBot', (botId) => {
        const playerRoom = playerRooms.get(socket.id);
        if (!playerRoom) return;

        const room = rooms.get(playerRoom.roomId);
        if (!room) return;

        if (room.hostId !== playerRoom.playerId) {
            socket.emit('error', { message: 'Only host can remove bots' });
            return;
        }

        const bot = room.game.players.find(p => p.id === botId && p.isBot);
        if (bot) {
            room.game.removePlayer(botId);
            io.to(playerRoom.roomId).emit('botRemoved', { botId });
            broadcastGameState(playerRoom.roomId);
        }
    });

    // Start the game
    socket.on('startGame', () => {
        const playerRoom = playerRooms.get(socket.id);
        if (!playerRoom) return;

        const room = rooms.get(playerRoom.roomId);
        if (!room) return;

        if (room.hostId !== playerRoom.playerId) {
            socket.emit('error', { message: 'Only host can start the game' });
            return;
        }

        if (room.game.players.length !== 4) {
            socket.emit('error', { message: 'Need exactly 4 players to start' });
            return;
        }

        if (room.game.startGame()) {
            io.to(playerRoom.roomId).emit('gameStarted');
            broadcastGameState(playerRoom.roomId);

            // Start bot turns if first player is bot
            handleBotTurn(playerRoom.roomId);
        }
    });

    // Play a card
    socket.on('playCard', (cardId) => {
        const playerRoom = playerRooms.get(socket.id);
        if (!playerRoom) return;

        const room = rooms.get(playerRoom.roomId);
        if (!room) return;

        const hand = room.game.hands[playerRoom.playerId];
        const card = hand?.find(c => c.id === cardId);

        const result = room.game.playCard(playerRoom.playerId, cardId);

        if (result.success) {
            io.to(playerRoom.roomId).emit('cardPlayed', {
                playerId: playerRoom.playerId,
                card,
                result
            });

            broadcastGameState(playerRoom.roomId);

            if (result.trickComplete) {
                setTimeout(() => {
                    io.to(playerRoom.roomId).emit('trickComplete', {
                        winner: result.trickWinner,
                        cards: result.trickCards
                    });

                    if (result.roundOver) {
                        io.to(playerRoom.roomId).emit('roundOver', {
                            scores: result.roundScores,
                            gameOver: result.gameOver
                        });
                    } else {
                        // Continue with bot turns
                        handleBotTurn(playerRoom.roomId);
                    }
                }, 1500);
            } else {
                // Check if next player is bot
                handleBotTurn(playerRoom.roomId);
            }
        } else {
            socket.emit('error', { message: result.error });
        }
    });

    // Start new round
    socket.on('newRound', () => {
        const playerRoom = playerRooms.get(socket.id);
        if (!playerRoom) return;

        const room = rooms.get(playerRoom.roomId);
        if (!room) return;

        if (room.hostId !== playerRoom.playerId) {
            socket.emit('error', { message: 'Only host can start new round' });
            return;
        }

        room.game.startNewRound();
        io.to(playerRoom.roomId).emit('newRoundStarted');
        broadcastGameState(playerRoom.roomId);
        handleBotTurn(playerRoom.roomId);
    });

    // Get room list (for joining)
    socket.on('getRooms', () => {
        const availableRooms = [];
        rooms.forEach((room, roomId) => {
            if (room.game.gamePhase === 'waiting' && room.game.players.length < 4) {
                availableRooms.push({
                    roomId,
                    playerCount: room.game.players.length,
                    hostName: room.game.players.find(p => p.isHost)?.name
                });
            }
        });
        socket.emit('roomList', availableRooms);
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);

        const playerRoom = playerRooms.get(socket.id);
        if (playerRoom) {
            const room = rooms.get(playerRoom.roomId);
            if (room) {
                const player = room.game.players.find(p => p.id === playerRoom.playerId);

                if (room.game.gamePhase === 'waiting') {
                    room.game.removePlayer(playerRoom.playerId);

                    if (room.game.players.length === 0) {
                        rooms.delete(playerRoom.roomId);
                    } else {
                        // Transfer host if needed
                        if (room.hostId === playerRoom.playerId) {
                            const newHost = room.game.players.find(p => !p.isBot);
                            if (newHost) {
                                room.hostId = newHost.id;
                                newHost.isHost = true;
                            }
                        }
                        io.to(playerRoom.roomId).emit('playerLeft', { playerId: playerRoom.playerId });
                        broadcastGameState(playerRoom.roomId);
                    }
                } else {
                    // Game in progress - replace with bot
                    if (player && !player.isBot) {
                        const bot = createBot(player.id);
                        bot.name = `${player.name} (Bot)`;
                        Object.assign(player, bot);

                        io.to(playerRoom.roomId).emit('playerReplacedByBot', { playerId: player.id });
                        broadcastGameState(playerRoom.roomId);
                        handleBotTurn(playerRoom.roomId);
                    }
                }
            }
            playerRooms.delete(socket.id);
        }
    });


    // Handle emotion/reaction
    socket.on('sendEmotion', (emotion) => {
        const playerRoom = playerRooms.get(socket.id);
        if (!playerRoom) return;

        // Broadcast to all players in the room, including sender (to confirm/show)
        io.to(playerRoom.roomId).emit('playerEmotion', {
            playerId: playerRoom.playerId,
            emotion: emotion
        });
    });
});

server.listen(PORT, () => {
    console.log(`JubMoo Game Server running on http://localhost:${PORT}`);
});
