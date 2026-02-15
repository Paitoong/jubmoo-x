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
        this.emotionDelay = 5000; // Default, will be updated from server
        this.jwtToken = localStorage.getItem('jwt_token');
        this.userProfile = null;

        // Sound system
        this.soundEnabled = localStorage.getItem('soundEnabled') !== 'false'; // default on
        this.sounds = {
            jackDiamond: new Audio('sound/jack-daimond.wav'),
            queenSpade: new Audio('sound/queen-spade.wav'),
            gameOver: new Audio('sound/game-over.wav'),
            cardPlacement: new Audio('sound/card-placement.wav'),
            endRound: new Audio('sound/end_round.wav')
        };
        // Preload sounds
        Object.values(this.sounds).forEach(s => s.load());

        // Track which special card sounds have been played to avoid duplicates
        this.playedCardSounds = new Set();

        // When a trick completes, defer showing new taken cards until trickComplete fires
        this.pendingTricksTaken = null; // cached tricksTaken snapshot before trick completion
        this.awaitingTrickComplete = false;

        // Feature flags (defaults: hidden until fetched)
        this.featureFlags = { facebook_login: false, create_account: false };

        this.initFacebookSDK();
        this.initializeElements();
        this.setupEventListeners();
        this.setupSocketListeners();
        this.fetchFeatureFlags();

        // Set initial sound button state
        const soundBtn = document.getElementById('btn-sound-toggle');
        if (soundBtn) {
            soundBtn.textContent = this.soundEnabled ? '🔊' : '🔇';
            soundBtn.title = this.soundEnabled ? 'Mute Sound' : 'Unmute Sound';
        }
    }

    initializeElements() {
        // Screens
        this.loginScreen = document.getElementById('login-screen');
        this.registerScreen = document.getElementById('register-screen');
        this.menuScreen = document.getElementById('menu-screen');
        this.profileScreen = document.getElementById('profile-screen');
        this.lobbyScreen = document.getElementById('lobby-screen');
        this.gameScreen = document.getElementById('game-screen');

        // Menu elements
        this.playerNameInput = document.getElementById('player-name');
        this.avatarPicker = document.getElementById('avatar-picker');
        this.joinRoomForm = document.getElementById('join-room-form');
        this.roomCodeInput = document.getElementById('room-code');
        this.targetScoreInput = document.getElementById('target-score');

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

        // Emotion Elements
        this.emotionPicker = document.getElementById('emotion-picker');
        this.btnEmotionToggle = document.getElementById('btn-emotion-toggle');

        // Login elements
        this.usernameInput = document.getElementById('username');
        this.passwordInput = document.getElementById('password');
        this.passwordInput = document.getElementById('password');
        this.loginError = document.getElementById('login-error');

        // Register elements
        this.regUsernameInput = document.getElementById('reg-username');
        this.regPasswordInput = document.getElementById('reg-password');
        this.regEmailInput = document.getElementById('reg-email');
        this.regNameInput = document.getElementById('reg-name');
        this.registerError = document.getElementById('register-error');

        // Profile elements
        this.profileEmail = document.getElementById('profile-email');
        this.profileName = document.getElementById('profile-name');
        this.profileAvatarPicker = document.getElementById('profile-avatar-picker');
    }

    setupEventListeners() {
        // Login
        document.getElementById('btn-login').addEventListener('click', () => this.login());
        document.getElementById('password').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.login();
        });
        document.getElementById('btn-fb-login').addEventListener('click', () => this.loginWithFacebook());
        document.getElementById('btn-to-register').addEventListener('click', () => this.showScreen(this.registerScreen));

        // Register
        document.getElementById('btn-register').addEventListener('click', () => this.register());
        document.getElementById('btn-back-login').addEventListener('click', () => this.showScreen(this.loginScreen));

        // Profile
        document.getElementById('btn-profile').addEventListener('click', () => this.showProfile());
        document.getElementById('btn-save-profile').addEventListener('click', () => this.saveProfile());
        document.getElementById('btn-profile-back').addEventListener('click', () => this.showScreen(this.menuScreen));
        document.getElementById('btn-logout').addEventListener('click', () => this.logout());

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

        // Emotion buttons
        this.btnEmotionToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleEmotionPicker();
        });

        this.emotionPicker.querySelectorAll('.emotion-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const emotion = e.target.dataset.emotion || e.target.textContent;
                this.sendEmotion(emotion);
                this.toggleEmotionPicker(false);
            });
        });

        // Sound toggle
        document.getElementById('btn-sound-toggle').addEventListener('click', () => this.toggleSound());

        // Help menu toggle
        document.getElementById('btn-help-toggle').addEventListener('click', (e) => {
            e.stopPropagation();
            document.getElementById('help-panel').classList.toggle('active');
        });

        // Close emotion picker when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.emotionPicker.contains(e.target) && e.target !== this.btnEmotionToggle) {
                this.toggleEmotionPicker(false);
            }
            // Close help panel when clicking outside
            const helpContainer = document.getElementById('help-menu-container');
            if (helpContainer && !helpContainer.contains(e.target)) {
                document.getElementById('help-panel').classList.remove('active');
            }
        });
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
        this.socket.on('playerEmotion', (data) => this.onPlayerEmotion(data));
        this.socket.on('error', (data) => this.onError(data));
    }

    // Login Logic
    async login() {
        const username = this.usernameInput.value.trim();
        const password = this.passwordInput.value.trim();

        if (!username || !password) {
            this.showLoginError('Please enter username and password');
            return;
        }

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (data.success) {
                this.jwtToken = data.token;
                localStorage.setItem('jwt_token', data.token);
                this.userProfile = data.user;
                this.showScreen(this.menuScreen);
                this.playerNameInput.value = this.userProfile.name || username; // Pre-fill name
                this.playerAvatar = this.userProfile.avatar || '😀';
                this.loadProfile(); // Refresh profile data
            } else {
                this.showLoginError(data.message || 'Login failed');
            }
        } catch (error) {
            this.showLoginError('Connection error');
        }
    }

    showLoginError(message) {
        this.loginError.textContent = message;
        this.loginError.style.display = 'block';
    }

    // Facebook Login
    initFacebookSDK() {
        window.fbAsyncInit = function () {
            FB.init({
                appId: 'YOUR_APP_ID', // Replace with config if available, or fetch
                cookie: true,
                xfbml: true,
                version: 'v16.0'
            });
            FB.AppEvents.logPageView();
        };
    }

    // Feature Flags
    async fetchFeatureFlags() {
        try {
            const res = await fetch('/api/feature-flags');
            const data = await res.json();
            if (data.success && data.flags) {
                this.featureFlags = data.flags;
            }
        } catch (err) {
            console.warn('Failed to fetch feature flags, using defaults');
        }
        this.applyFeatureFlags();
    }

    applyFeatureFlags() {
        const fbBtn = document.getElementById('btn-fb-login');
        const registerBtn = document.getElementById('btn-to-register');
        const divider = document.getElementById('login-divider');

        const showFb = this.featureFlags.facebook_login;
        const showRegister = this.featureFlags.create_account;

        if (fbBtn) fbBtn.style.display = showFb ? 'block' : 'none';
        if (registerBtn) registerBtn.style.display = showRegister ? 'block' : 'none';
        // Show divider if either feature is enabled
        if (divider) divider.style.display = (showFb || showRegister) ? 'block' : 'none';
    }

    loginWithFacebook() {
        if (typeof FB === 'undefined') {
            this.showLoginError('Facebook SDK not loaded');
            return;
        }

        FB.login((response) => {
            if (response.authResponse) {
                this.handleFacebookLogin(response.authResponse);
            } else {
                this.showLoginError('Facebook login cancelled');
            }
        }, { scope: 'public_profile,email' });
    }

    async handleFacebookLogin(authResponse) {
        FB.api('/me', { fields: 'name,email,picture' }, async (response) => {
            try {
                const apiRes = await fetch('/api/auth/facebook', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: response.email,
                        name: response.name,
                        facebookId: response.id,
                        avatar: '😀' // Default, or map from picture
                    })
                });

                const data = await apiRes.json();
                if (data.success) {
                    this.jwtToken = data.token;
                    localStorage.setItem('jwt_token', data.token);
                    this.userProfile = data.user;
                    this.showScreen(this.menuScreen);
                    this.playerNameInput.value = this.userProfile.name;
                    this.playerAvatar = this.userProfile.avatar;
                    this.loadProfile();
                } else {
                    this.showLoginError(data.message || 'Facebook login failed');
                }
            } catch (error) {
                this.showLoginError('Connection error');
            }
        });
    }

    // Profile Management
    async loadProfile() {
        if (!this.jwtToken) return;

        try {
            const response = await fetch('/api/profile', {
                headers: { 'Authorization': `Bearer ${this.jwtToken}` }
            });
            const data = await response.json();
            if (data.success) {
                this.userProfile = data.user;
                this.profileEmail.value = this.userProfile.email || 'N/A';
                this.profileName.value = this.userProfile.name;

                // Populate avatar picker in profile
                // (Simplified: just copying the main picker logic or re-rendering)
                this.profileAvatarPicker.innerHTML = this.avatarPicker.innerHTML;
                this.profileAvatarPicker.querySelectorAll('.avatar-option').forEach(opt => {
                    opt.classList.remove('selected');
                    if (opt.dataset.avatar === this.userProfile.avatar) {
                        opt.classList.add('selected');
                    }
                    opt.addEventListener('click', (e) => {
                        this.profileAvatarPicker.querySelectorAll('.avatar-option').forEach(o => o.classList.remove('selected'));
                        e.target.classList.add('selected');
                    });
                });
            }
        } catch (error) {
            console.error('Failed to load profile', error);
        }
    }

    showProfile() {
        this.loadProfile();
        this.showScreen(this.profileScreen);
    }

    async saveProfile() {
        const name = this.profileName.value.trim();
        const selectedAvatar = this.profileAvatarPicker.querySelector('.selected')?.dataset.avatar || '😀';

        try {
            const response = await fetch('/api/profile', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.jwtToken}`
                },
                body: JSON.stringify({ name, avatar: selectedAvatar })
            });

            const data = await response.json();
            if (data.success) {
                this.userProfile = data.user;
                this.playerNameInput.value = data.user.name;
                this.playerAvatar = data.user.avatar;
                alert('Profile updated!');
                this.showScreen(this.menuScreen);
            } else {
                alert(data.message || 'Update failed');
            }
        } catch (error) {
            alert('Connection error');
        }
    }

    // Register Logic
    async register() {
        const username = this.regUsernameInput.value.trim();
        const password = this.regPasswordInput.value.trim();
        const email = this.regEmailInput.value.trim();
        const name = this.regNameInput.value.trim();

        if (!username || !password || !email || !name) {
            this.showRegisterError('Please fill in all fields');
            return;
        }

        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, email, name })
            });

            const data = await response.json();

            if (data.success) {
                this.jwtToken = data.token;
                localStorage.setItem('jwt_token', data.token);
                this.userProfile = data.user;
                this.showScreen(this.menuScreen);
                this.playerNameInput.value = this.userProfile.name;
                this.playerAvatar = this.userProfile.avatar || '😀';
                this.loadProfile();
                alert('Registration successful! Welcome!');
            } else {
                this.showRegisterError(data.message || 'Registration failed');
            }
        } catch (error) {
            this.showRegisterError('Connection error');
        }
    }

    showRegisterError(message) {
        this.registerError.textContent = message;
        this.registerError.style.display = 'block';
    }

    logout() {
        localStorage.removeItem('jwt_token');
        this.jwtToken = null;
        this.userProfile = null;
        window.location.reload();
    }

    // UI Helper Methods
    showScreen(screen) {
        this.loginScreen.classList.remove('active');
        this.registerScreen.classList.remove('active');
        this.menuScreen.classList.remove('active');
        this.profileScreen.classList.remove('active');
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
            avatar: this.playerAvatar,
            targetScore: this.targetScoreInput.value
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
        if (data.config && data.config.emotionDelay) {
            this.emotionDelay = data.config.emotionDelay;
        }

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
        if (data.config && data.config.emotionDelay) {
            this.emotionDelay = data.config.emotionDelay;
        }

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
        // If we're awaiting trick completion, cache the pre-trick tricksTaken
        // so we don't show new taken cards until the trickComplete event fires
        if (this.awaitingTrickComplete && this.pendingTricksTaken) {
            // Override tricksTaken in state with the cached snapshot
            state.players = state.players.map(p => ({
                ...p,
                tricksTaken: this.pendingTricksTaken[p.id] || p.tricksTaken
            }));
        }

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
        // Play special card sounds when the card is played (not after trick completes)
        const card = data.card;
        if (card) {
            if (card.rank === 'Q' && card.suit === 'spades') {
                this.playSound('queenSpade');
            } else if (card.rank === 'J' && card.suit === 'diamonds') {
                this.playSound('jackDiamond');
            }
        }

        // If trick is completing (4th card played), cache current tricksTaken
        // so we don't render the new taken cards until trickComplete fires
        if (data.result && data.result.trickComplete) {
            this.awaitingTrickComplete = true;
            if (this.gameState) {
                this.pendingTricksTaken = {};
                for (const p of this.gameState.players) {
                    this.pendingTricksTaken[p.id] = [...(p.tricksTaken || [])];
                }
            }
        }
    }

    onTrickComplete(data) {
        // Play card placement sound once per completed trick
        this.playSound('cardPlacement');

        // Release the cached tricksTaken — now render the updated taken cards
        this.awaitingTrickComplete = false;
        this.pendingTricksTaken = null;
        this.playedCardSounds.clear();

        // Update tricksTaken from the trick data so taken cards render correctly
        if (this.gameState && data.cards) {
            const winnerId = data.winner;
            for (const play of data.cards) {
                const card = play.card;
                if (!card) continue;
                const isScoring = card.suit === 'hearts' ||
                    (card.suit === 'spades' && card.rank === 'Q') ||
                    (card.suit === 'diamonds' && card.rank === 'J') ||
                    (card.suit === 'clubs' && card.rank === '10');
                if (isScoring) {
                    const winnerPlayer = this.gameState.players.find(p => p.id === winnerId);
                    if (winnerPlayer) {
                        const alreadyHas = (winnerPlayer.tricksTaken || []).some(c => c.id === card.id);
                        if (!alreadyHas) {
                            winnerPlayer.tricksTaken = winnerPlayer.tricksTaken || [];
                            winnerPlayer.tricksTaken.push(card);
                        }
                    }
                }
            }
            this.renderGame();
        }

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
        this.playSound('endRound');
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

        // Sort hand by suit and rank (low to high)
        const suitOrder = { clubs: 0, diamonds: 1, spades: 2, hearts: 3 };
        const rankValues = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
        const sortedHand = [...hand].sort((a, b) => {
            if (suitOrder[a.suit] !== suitOrder[b.suit]) {
                return suitOrder[a.suit] - suitOrder[b.suit];
            }
            return (rankValues[a.rank] || 0) - (rankValues[b.rank] || 0);
        });

        let html = '';
        for (const card of sortedHand) {
            const isValid = validIds.includes(card.id);

            const classes = [
                'card',
                card.suit,
                isValid ? 'valid' : (this.gameState.gamePhase === 'playing' ? 'invalid' : '')
            ].filter(Boolean).join(' ');

            const svgPath = this.getCardSvgPath(card.rank, card.suit);

            html += `
                <div class="${classes}" 
                     data-card-id="${card.id}"
                     onclick="game.onCardClick('${card.id}')">
                    <img src="${svgPath}" alt="${card.rank} of ${card.suit}" class="card-svg" draggable="false">
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
                    cardsHtml += '<div class="opponent-card-back"><img src="svg_cards/card_back.svg" alt="card back" class="card-back-svg" draggable="false"></div>';
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

        // Sort taken cards by suit and rank (low to high)
        const suitOrder = { clubs: 0, diamonds: 1, spades: 2, hearts: 3 };
        const rankValues = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
        const sortedCards = [...cards].sort((a, b) => {
            if (suitOrder[a.suit] !== suitOrder[b.suit]) {
                return suitOrder[a.suit] - suitOrder[b.suit];
            }
            return (rankValues[a.rank] || 0) - (rankValues[b.rank] || 0);
        });

        let html = '';
        for (const card of sortedCards) {
            const svgPath = this.getCardSvgPath(card.rank, card.suit);
            html += `
                <div class="mini-card ${card.suit}">
                    <img src="${svgPath}" alt="${card.rank} of ${card.suit}" class="mini-card-svg" draggable="false">
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
            const svgPath = this.getCardSvgPath(card.rank, card.suit);

            html += `
                <div class="trick-card ${position}">
                    <div class="card ${card.suit}">
                        <img src="${svgPath}" alt="${card.rank} of ${card.suit}" class="card-svg" draggable="false">
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

    getCardSvgPath(rank, suit) {
        const rankMap = {
            'A': 'ace',
            'K': 'king',
            'Q': 'queen',
            'J': 'jack'
        };
        const rankName = rankMap[rank] || rank;
        return `svg_cards/${rankName}_of_${suit}.svg`;
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
            <div class="game-result" style="text-align: center;">
                <h3>🐷 The Pig Award Goes To... 🐷</h3>
                <img src="image/loser_player.png" alt="Loser" style="max-width: 200px; margin: 20px auto; display: block;" />
                <p style="font-size: 24px; font-weight: bold; margin-top: 10px;">${loser?.name || 'Unknown'}</p>
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

        // Play game over sound
        this.playSound('gameOver');
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

    // Sound Logic
    playSound(name) {
        if (!this.soundEnabled) return;
        const sound = this.sounds[name];
        if (sound) {
            sound.currentTime = 0;
            sound.play().catch(() => {});
        }
    }

    toggleSound() {
        this.soundEnabled = !this.soundEnabled;
        localStorage.setItem('soundEnabled', this.soundEnabled);
        const btn = document.getElementById('btn-sound-toggle');
        if (btn) {
            btn.textContent = this.soundEnabled ? '🔊' : '🔇';
            btn.title = this.soundEnabled ? 'Mute Sound' : 'Unmute Sound';
        }
    }

    // Emotion Logic
    toggleEmotionPicker(show = null) {
        if (show === null) {
            this.emotionPicker.classList.toggle('active');
        } else if (show) {
            this.emotionPicker.classList.add('active');
        } else {
            this.emotionPicker.classList.remove('active');
        }
    }

    sendEmotion(emotion) {
        this.socket.emit('sendEmotion', emotion);
    }

    onPlayerEmotion(data) {
        const { playerId, emotion } = data;
        let targetElement;

        if (playerId === this.playerId) {
            targetElement = document.getElementById('my-avatar');
        } else {
            const position = this.getPlayerPosition(playerId);
            const opponentArea = document.getElementById(`opponent-${position}`);
            if (opponentArea) {
                targetElement = opponentArea.querySelector('.player-avatar');
            }
        }

        if (targetElement) {
            this.showFloatingEmotion(targetElement, emotion);
        }
    }

    showFloatingEmotion(targetElement, emotion) {
        const floatingEl = document.createElement('div');
        floatingEl.className = 'floating-emotion';
        floatingEl.textContent = emotion;

        // Position relative to the target avatar
        const rect = targetElement.getBoundingClientRect();

        // We need to account for the fact that floating-emotion is absolute positioned in the body/screen
        // or effectively relative to the parent if we append it there.
        // Let's append to the targetElement's parent to keep it simple, 
        // assuming parent has position: relative (player-info does not, but we can append to document.body and use absolute coords)

        // Append to body and use fixed/absolute positioning
        document.body.appendChild(floatingEl);

        const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
        const scrollY = window.pageYOffset || document.documentElement.scrollTop;

        floatingEl.style.left = (rect.left + rect.width / 2 - 20) + scrollX + 'px'; // Center horizontally
        floatingEl.style.top = (rect.top) + scrollY + 'px'; // Start at top of avatar

        // Remove after animation
        setTimeout(() => {
            if (floatingEl.parentNode) {
                floatingEl.parentNode.removeChild(floatingEl);
            }
        }, this.emotionDelay);
    }
}

// Initialize game when DOM is loaded
let game;
document.addEventListener('DOMContentLoaded', () => {
    game = new GongZhuClient();
});
