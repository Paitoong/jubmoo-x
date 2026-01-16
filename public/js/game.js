// Gong Zhu Client-Side Game Logic
class GongZhuClient {
    constructor() {
        this.socket = io();
        this.playerId = null;
        this.roomId = null;
        this.isHost = false;
        this.gameState = null;
        this.playerName = 'Player';
        this.playerAvatar = '😀';
        this.selectedCard = null;

        this.initializeElements();
        this.setupEventListeners();
        this.setupSocketListeners();
    }

    initializeElements() {
        // Screens
        this.menuScreen = document.getElementById('menu-screen');
        this.lobbyScreen = document.getElementById('lobby-screen');
        this.gameScreen = document.getElementById('game-screen');

        // Menu elements
        this.playerNameInput = document.getElementById('player-name');
        this.avatarPicker = document.getElementById('avatar-picker');
        this.joinRoomForm = document.getElementById('join-room-form');
        this.roomCodeInput = document.getElementById('room-code');

        // Lobby elements
        this.displayRoomCode = document.getElementById('display-room-code');
        this.playersList = document.getElementById('players-list');
        this.hostActions = document.getElementById('host-actions');
        this.waitingMessage = document.getElementById('waiting-message');
        this.btnStartGame = document.getElementById('btn-start-game');

        // Game elements
        this.handCards = document.getElementById('hand-cards');
        this.trickCards = document.getElementById('trick-cards');
        this.gameMessage = document.getElementById('game-message');
        this.scoreList = document.getElementById('score-list');

        // Modals
        this.roundModal = document.getElementById('round-modal');
        this.gameoverModal = document.getElementById('gameover-modal');
        this.rulesModal = document.getElementById('rules-modal');
    }

    setupEventListeners() {
        // Menu buttons
        document.getElementById('btn-create-room').addEventListener('click', () => this.createRoom());
        document.getElementById('btn-join-room').addEventListener('click', () => this.showJoinForm());
        document.getElementById('btn-confirm-join').addEventListener('click', () => this.joinRoom());
        document.getElementById('btn-cancel-join').addEventListener('click', () => this.hideJoinForm());
        document.getElementById('btn-how-to-play').addEventListener('click', () => this.showRules());
        document.getElementById('btn-close-rules').addEventListener('click', () => this.hideRules());

        // Avatar picker
        this.avatarPicker.querySelectorAll('.avatar-option').forEach(option => {
            option.addEventListener('click', (e) => this.selectAvatar(e.target));
        });

        // Lobby buttons
        document.getElementById('btn-copy-code').addEventListener('click', () => this.copyRoomCode());
        document.getElementById('btn-add-bot').addEventListener('click', () => this.addBot());
        document.getElementById('btn-start-game').addEventListener('click', () => this.startGame());
        document.getElementById('btn-leave-room').addEventListener('click', () => this.leaveRoom());

        // Modal buttons
        document.getElementById('btn-next-round').addEventListener('click', () => this.nextRound());
        document.getElementById('btn-new-game').addEventListener('click', () => this.newGame());
        document.getElementById('btn-back-menu').addEventListener('click', () => this.backToMenu());
    }

    setupSocketListeners() {
        this.socket.on('roomCreated', (data) => this.onRoomCreated(data));
        this.socket.on('roomJoined', (data) => this.onRoomJoined(data));
        this.socket.on('playerJoined', (data) => this.onPlayerJoined(data));
        this.socket.on('playerLeft', (data) => this.onPlayerLeft(data));
        this.socket.on('botAdded', (data) => this.onBotAdded(data));
        this.socket.on('botRemoved', (data) => this.onBotRemoved(data));
        this.socket.on('gameState', (state) => this.onGameState(state));
        this.socket.on('gameStarted', () => this.onGameStarted());
        this.socket.on('cardPlayed', (data) => this.onCardPlayed(data));
        this.socket.on('trickComplete', (data) => this.onTrickComplete(data));
        this.socket.on('roundOver', (data) => this.onRoundOver(data));
        this.socket.on('newRoundStarted', () => this.onNewRoundStarted());
        this.socket.on('playerReplacedByBot', (data) => this.onPlayerReplacedByBot(data));
        this.socket.on('error', (data) => this.onError(data));
    }

    // UI Helper Methods
    showScreen(screen) {
        this.menuScreen.classList.remove('active');
        this.lobbyScreen.classList.remove('active');
        this.gameScreen.classList.remove('active');
        screen.classList.add('active');
    }

    selectAvatar(element) {
        this.avatarPicker.querySelectorAll('.avatar-option').forEach(opt => {
            opt.classList.remove('selected');
        });
        element.classList.add('selected');
        this.playerAvatar = element.dataset.avatar;
    }

    showJoinForm() {
        this.joinRoomForm.style.display = 'block';
    }

    hideJoinForm() {
        this.joinRoomForm.style.display = 'none';
        this.roomCodeInput.value = '';
    }

    showRules() {
        this.rulesModal.classList.add('active');
    }

    hideRules() {
        this.rulesModal.classList.remove('active');
    }

    copyRoomCode() {
        navigator.clipboard.writeText(this.roomId).then(() => {
            const btn = document.getElementById('btn-copy-code');
            btn.textContent = '✓';
            setTimeout(() => btn.textContent = '📋', 2000);
        });
    }

    // Room Management
    createRoom() {
        this.playerName = this.playerNameInput.value.trim() || 'Player';
        this.socket.emit('createRoom', {
            name: this.playerName,
            avatar: this.playerAvatar
        });
    }

    joinRoom() {
        const roomCode = this.roomCodeInput.value.trim().toUpperCase();
        if (roomCode.length !== 6) {
            alert('Please enter a valid 6-character room code');
            return;
        }
        this.playerName = this.playerNameInput.value.trim() || 'Player';
        this.socket.emit('joinRoom', {
            roomId: roomCode,
            playerData: {
                name: this.playerName,
                avatar: this.playerAvatar
            }
        });
    }

    leaveRoom() {
        window.location.reload();
    }

    addBot() {
        this.socket.emit('addBot');
    }

    removeBot(botId) {
        this.socket.emit('removeBot', botId);
    }

    startGame() {
        this.socket.emit('startGame');
    }

    // Socket Event Handlers
    onRoomCreated(data) {
        this.playerId = data.playerId;
        this.roomId = data.roomId;
        this.isHost = true;
        this.gameState = data.gameState;

        this.displayRoomCode.textContent = this.roomId;
        this.hostActions.style.display = 'flex';
        this.waitingMessage.style.display = 'none';

        this.updateLobbyPlayers();
        this.showScreen(this.lobbyScreen);
    }

    onRoomJoined(data) {
        this.playerId = data.playerId;
        this.roomId = data.roomId;
        this.isHost = false;
        this.gameState = data.gameState;

        this.displayRoomCode.textContent = this.roomId;
        this.hostActions.style.display = 'none';
        this.waitingMessage.style.display = 'block';

        this.updateLobbyPlayers();
        this.showScreen(this.lobbyScreen);
    }

    onPlayerJoined(data) {
        this.updateLobbyPlayers();
    }

    onPlayerLeft(data) {
        this.updateLobbyPlayers();
    }

    onBotAdded(data) {
        this.updateLobbyPlayers();
    }

    onBotRemoved(data) {
        this.updateLobbyPlayers();
    }

    onGameState(state) {
        this.gameState = state;
        
        if (state.gamePhase === 'waiting') {
            this.updateLobbyPlayers();
        } else {
            this.renderGame();
        }
    }

    onGameStarted() {
        this.showScreen(this.gameScreen);
    }

    onCardPlayed(data) {
        // Animation will be handled by gameState update
    }

    onTrickComplete(data) {
        // Highlight winner
        const winnerPosition = this.getPlayerPosition(data.winner);
        const opponentArea = document.getElementById(`opponent-${winnerPosition}`);
        if (opponentArea) {
            opponentArea.classList.add('trick-winner');
            setTimeout(() => opponentArea.classList.remove('trick-winner'), 1500);
        }
        if (data.winner === this.playerId) {
            document.getElementById('player-area').classList.add('trick-winner');
            setTimeout(() => document.getElementById('player-area').classList.remove('trick-winner'), 1500);
        }
    }

    onRoundOver(data) {
        this.showRoundModal(data.scores, data.gameOver);
    }

    onNewRoundStarted() {
        this.roundModal.classList.remove('active');
    }

    onPlayerReplacedByBot(data) {
        // Player left and was replaced by bot
    }

    onError(data) {
        alert(data.message);
    }

    // Lobby Rendering
    updateLobbyPlayers() {
        if (!this.gameState) return;

        const players = this.gameState.players;
        let html = '';

        for (let i = 0; i < 4; i++) {
            if (players[i]) {
                const player = players[i];
                const isHost = i === 0 || player.isHost;
                html += `
                    <div class="player-slot">
                        <span class="slot-avatar">${player.avatar || '😀'}</span>
                        <div>
                            <div class="slot-name">${player.name}${player.isBot ? ' 🤖' : ''}</div>
                        </div>
                        ${isHost ? '<span class="slot-host">👑 Host</span>' : ''}
                        ${player.isBot && this.isHost ? `<button class="btn-remove-bot" onclick="game.removeBot('${player.id}')">×</button>` : ''}
                    </div>
                `;
            } else {
                html += `
                    <div class="player-slot empty">
                        <span>Waiting for player...</span>
                    </div>
                `;
            }
        }

        this.playersList.innerHTML = html;

        // Enable/disable start button
        if (this.isHost) {
            this.btnStartGame.disabled = players.length !== 4;
        }
    }

    // Game Rendering
    renderGame() {
        if (!this.gameState) return;

        this.renderHand();
        this.renderOpponents();
        this.renderTrickCards();
        this.renderScoreboard();
        this.updateCurrentTurn();
    }

    renderHand() {
        const hand = this.gameState.hand || [];
        const validCards = this.gameState.validCards || [];
        const validIds = validCards.map(c => c.id);

        // Sort hand by suit and rank
        const suitOrder = { spades: 0, hearts: 1, clubs: 2, diamonds: 3 };
        const sortedHand = [...hand].sort((a, b) => {
            if (suitOrder[a.suit] !== suitOrder[b.suit]) {
                return suitOrder[a.suit] - suitOrder[b.suit];
            }
            return b.getValue ? b.getValue() - a.getValue() : 0;
        });

        let html = '';
        for (const card of sortedHand) {
            const isValid = validIds.includes(card.id);

            const classes = [
                'card',
                card.suit,
                isValid ? 'valid' : (this.gameState.gamePhase === 'playing' ? 'invalid' : '')
            ].filter(Boolean).join(' ');

            html += `
                <div class="${classes}" 
                     data-card-id="${card.id}"
                     onclick="game.onCardClick('${card.id}')">
                    <span class="card-rank">${card.rank}</span>
                    <span class="card-suit">${this.getSuitSymbol(card.suit)}</span>
                </div>
            `;
        }

        this.handCards.innerHTML = html;

        // Update player info
        document.getElementById('my-name').textContent = this.playerName;
        document.getElementById('my-avatar').textContent = this.playerAvatar;
        
        const myPlayer = this.gameState.players.find(p => p.id === this.playerId);
        if (myPlayer) {
            const myScoreEl = document.getElementById('my-score');
            // Show total score and round score separately
            const roundScoreText = myPlayer.roundScore !== 0 ? ` (Round: ${myPlayer.roundScore >= 0 ? '+' : ''}${myPlayer.roundScore})` : '';
            myScoreEl.textContent = `Score: ${myPlayer.score}${roundScoreText}`;
            
            // Color based on round score if active, otherwise total score
            const scoreForColor = myPlayer.roundScore !== 0 ? myPlayer.roundScore : myPlayer.score;
            myScoreEl.className = 'player-score ' + (scoreForColor >= 0 ? 'positive' : 'negative');
            
            // Render my taken cards
            this.renderMiniCards('my-taken-cards', myPlayer.tricksTaken || []);
        }
    }

    renderOpponents() {
        const myIndex = this.gameState.players.findIndex(p => p.id === this.playerId);
        const positions = ['right', 'top', 'left']; // Anticlockwise from player

        for (let i = 1; i <= 3; i++) {
            const opponentIndex = (myIndex + i) % 4;
            const opponent = this.gameState.players[opponentIndex];
            const position = positions[i - 1];
            const element = document.getElementById(`opponent-${position}`);

            if (opponent && element) {
                // Update info
                element.querySelector('.player-avatar').textContent = opponent.avatar || '🤖';
                element.querySelector('.player-name').textContent = opponent.name + (opponent.isBot ? ' 🤖' : '');
                
                // Update score with round score
                const scoreEl = element.querySelector('.player-score');
                const roundScoreText = opponent.roundScore !== 0 ? ` (Round: ${opponent.roundScore >= 0 ? '+' : ''}${opponent.roundScore})` : '';
                scoreEl.textContent = `Score: ${opponent.score}${roundScoreText}`;
                
                // Color based on round score if active, otherwise total score
                const scoreForColor = opponent.roundScore !== 0 ? opponent.roundScore : opponent.score;
                scoreEl.className = 'player-score ' + (scoreForColor >= 0 ? 'positive' : 'negative');

                // Render card backs
                const cardCount = opponent.cardCount || 0;
                let cardsHtml = '';
                for (let j = 0; j < cardCount; j++) {
                    cardsHtml += '<div class="opponent-card-back"></div>';
                }
                element.querySelector('.opponent-cards').innerHTML = cardsHtml;

                // Render taken cards
                this.renderMiniCards(element.querySelector('.taken-cards'), opponent.tricksTaken || []);
            }
        }
    }

    renderMiniCards(container, cards) {
        if (typeof container === 'string') {
            container = document.getElementById(container);
        }
        if (!container) return;

        let html = '';
        for (const card of cards) {
            html += `
                <div class="mini-card ${card.suit}">
                    <span>${card.rank}</span>
                    <span>${this.getSuitSymbol(card.suit)}</span>
                </div>
            `;
        }
        container.innerHTML = html;
    }

    renderTrickCards() {
        // Show current trick, or last completed trick if current is empty
        let trick = this.gameState.currentTrick || [];
        if (trick.length === 0 && this.gameState.lastCompletedTrick && this.gameState.lastCompletedTrick.length > 0) {
            trick = this.gameState.lastCompletedTrick;
        }
        
        const myIndex = this.gameState.players.findIndex(p => p.id === this.playerId);
        const positions = ['from-bottom', 'from-right', 'from-top', 'from-left'];

        let html = '';
        for (const play of trick) {
            const playerIndex = this.gameState.players.findIndex(p => p.id === play.playerId);
            const relativePos = (playerIndex - myIndex + 4) % 4;
            const position = positions[relativePos];
            const card = play.card;

            html += `
                <div class="trick-card ${position}">
                    <div class="card ${card.suit}">
                        <span class="card-rank">${card.rank}</span>
                        <span class="card-suit">${this.getSuitSymbol(card.suit)}</span>
                    </div>
                </div>
            `;
        }

        this.trickCards.innerHTML = html;
    }

    renderScoreboard() {
        let html = '';
        for (const player of this.gameState.players) {
            const scoreClass = player.score >= 0 ? 'positive' : 'negative';
            const roundScoreClass = player.roundScore >= 0 ? 'positive' : 'negative';
            const isMe = player.id === this.playerId;
            const roundScoreText = player.roundScore !== 0 ? ` <span class="${roundScoreClass}">(${player.roundScore >= 0 ? '+' : ''}${player.roundScore})</span>` : '';
            html += `
                <div class="score-item">
                    <span>${player.avatar} ${player.name}${isMe ? ' (You)' : ''}</span>
                    <span class="score-value ${scoreClass}">${player.score}${roundScoreText}</span>
                </div>
            `;
        }
        this.scoreList.innerHTML = html;
    }

    updateCurrentTurn() {
        const currentPlayerId = this.gameState.currentPlayerId;
        const myIndex = this.gameState.players.findIndex(p => p.id === this.playerId);
        const positions = ['right', 'top', 'left'];

        // Remove current-turn from all
        document.querySelectorAll('.opponent-area, .player-area').forEach(el => {
            el.classList.remove('current-turn');
        });

        if (currentPlayerId === this.playerId) {
            document.getElementById('player-area').classList.add('current-turn');
            this.gameMessage.textContent = 'Your turn!';
        } else {
            const currentIndex = this.gameState.players.findIndex(p => p.id === currentPlayerId);
            const relativePos = (currentIndex - myIndex + 4) % 4;
            if (relativePos > 0 && relativePos <= 3) {
                const position = positions[relativePos - 1];
                document.getElementById(`opponent-${position}`).classList.add('current-turn');
            }
            
            const currentPlayer = this.gameState.players.find(p => p.id === currentPlayerId);
            this.gameMessage.textContent = `${currentPlayer?.name || 'Player'}'s turn`;
        }
    }

    // Card Click Handler
    onCardClick(cardId) {
        if (this.gameState.gamePhase === 'playing') {
            if (this.gameState.currentPlayerId === this.playerId) {
                const validIds = (this.gameState.validCards || []).map(c => c.id);
                if (validIds.includes(cardId)) {
                    this.socket.emit('playCard', cardId);
                }
            }
        }
    }

    // Helper Methods
    getSuitSymbol(suit) {
        const symbols = {
            hearts: '♥',
            diamonds: '♦',
            clubs: '♣',
            spades: '♠'
        };
        return symbols[suit] || suit;
    }

    getPlayerPosition(playerId) {
        const myIndex = this.gameState.players.findIndex(p => p.id === this.playerId);
        const playerIndex = this.gameState.players.findIndex(p => p.id === playerId);
        const relativePos = (playerIndex - myIndex + 4) % 4;
        const positions = ['bottom', 'right', 'top', 'left'];
        return positions[relativePos];
    }

    // Round/Game End Handlers
    showRoundModal(roundScores, gameOver) {
        let roundHtml = '<h3>Round Scores</h3>';
        let totalHtml = '<h3>Total Scores</h3>';

        for (const player of this.gameState.players) {
            const roundScore = roundScores[player.id] || 0;
            const roundClass = roundScore >= 0 ? 'positive' : 'negative';
            const totalClass = player.score >= 0 ? 'positive' : 'negative';
            const isMe = player.id === this.playerId;

            roundHtml += `
                <div class="score-row">
                    <span class="name">${player.avatar} ${player.name}${isMe ? ' (You)' : ''}</span>
                    <span class="value ${roundClass}">${roundScore >= 0 ? '+' : ''}${roundScore}</span>
                </div>
            `;

            totalHtml += `
                <div class="score-row">
                    <span class="name">${player.avatar} ${player.name}${isMe ? ' (You)' : ''}</span>
                    <span class="value ${totalClass}">${player.score}</span>
                </div>
            `;
        }

        document.getElementById('round-scores').innerHTML = roundHtml;
        document.getElementById('total-scores').innerHTML = totalHtml;

        if (gameOver && gameOver.gameOver) {
            this.showGameOverModal(gameOver);
        } else {
            // Show/hide next round button based on host status
            document.getElementById('btn-next-round').style.display = this.isHost ? 'inline-block' : 'none';
            this.roundModal.classList.add('active');
        }
    }

    showGameOverModal(gameOver) {
        this.roundModal.classList.remove('active');

        const loser = this.gameState.players.find(p => p.id === gameOver.loser);
        let resultHtml = `
            <div class="game-result">
                <h3>🐷 The Pig Award Goes To... 🐷</h3>
                <p style="font-size: 48px; margin: 20px 0;">${loser?.avatar || '🐷'}</p>
                <p style="font-size: 24px;">${loser?.name || 'Unknown'}</p>
                <p style="color: var(--danger-color); font-size: 20px;">Score: ${loser?.score || -1000}</p>
            </div>
        `;

        document.getElementById('game-result').innerHTML = resultHtml;

        let scoresHtml = '<h3>Final Standings</h3>';
        const sortedPlayers = [...this.gameState.players].sort((a, b) => b.score - a.score);
        
        sortedPlayers.forEach((player, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '💀';
            const isMe = player.id === this.playerId;
            const scoreClass = player.score >= 0 ? 'positive' : 'negative';

            scoresHtml += `
                <div class="score-row">
                    <span class="name">${medal} ${player.avatar} ${player.name}${isMe ? ' (You)' : ''}</span>
                    <span class="value ${scoreClass}">${player.score}</span>
                </div>
            `;
        });

        document.getElementById('final-scores').innerHTML = scoresHtml;
        
        // Show/hide new game button based on host status
        document.getElementById('btn-new-game').style.display = this.isHost ? 'inline-block' : 'none';
        this.gameoverModal.classList.add('active');
    }

    nextRound() {
        this.socket.emit('newRound');
    }

    newGame() {
        this.socket.emit('newRound');
        this.gameoverModal.classList.remove('active');
    }

    backToMenu() {
        window.location.reload();
    }
}

// Initialize game when DOM is loaded
let game;
document.addEventListener('DOMContentLoaded', () => {
    game = new GongZhuClient();
});
