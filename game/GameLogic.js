// Gong Zhu Game Logic
const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RANK_VALUES = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };

class Card {
    constructor(suit, rank) {
        this.suit = suit;
        this.rank = rank;
        this.id = `${rank}_${suit}`;
    }

    getValue() {
        return RANK_VALUES[this.rank];
    }

    toString() {
        return `${this.rank} of ${this.suit}`;
    }
}

class Deck {
    constructor() {
        this.cards = [];
        this.reset();
    }

    reset() {
        this.cards = [];
        for (const suit of SUITS) {
            for (const rank of RANKS) {
                this.cards.push(new Card(suit, rank));
            }
        }
    }

    shuffle() {
        for (let i = this.cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
        }
    }

    deal(numPlayers) {
        const hands = Array.from({ length: numPlayers }, () => []);
        let playerIndex = 0;
        while (this.cards.length > 0) {
            hands[playerIndex].push(this.cards.pop());
            playerIndex = (playerIndex + 1) % numPlayers;
        }
        return hands;
    }
}

class GongZhuGame {
    constructor(roomId, targetScore = -500) {
        this.roomId = roomId;
        this.targetScore = targetScore;
        this.players = [];
        this.deck = new Deck();
        this.hands = {};
        this.currentTrick = [];
        this.lastCompletedTrick = []; // Store last completed trick for display
        this.currentPlayerIndex = 0;
        this.leadSuit = null;
        this.scores = {};
        this.tricksTaken = {};
        this.gamePhase = 'waiting'; // waiting, playing, finished
        this.previousPigHolder = null;
        this.roundNumber = 1;
    }

    addPlayer(player) {
        if (this.players.length >= 4) return false;
        this.players.push(player);
        this.scores[player.id] = 0;
        return true;
    }

    removePlayer(playerId) {
        const index = this.players.findIndex(p => p.id === playerId);
        if (index !== -1) {
            this.players.splice(index, 1);
            delete this.scores[playerId];
            return true;
        }
        return false;
    }

    startGame() {
        if (this.players.length !== 4) return false;

        this.deck.reset();
        this.deck.shuffle();

        const dealtHands = this.deck.deal(4);
        this.players.forEach((player, index) => {
            this.hands[player.id] = dealtHands[index];
            this.tricksTaken[player.id] = [];
        });

        this.gamePhase = 'playing';
        this.currentTrick = [];
        this.lastCompletedTrick = [];
        this.leadSuit = null;
        this.currentPlayerIndex = this.findStartingPlayer();

        return true;
    }

    // Find starting player (holder of 2 of spades for first round, or previous pig holder)
    findStartingPlayer() {
        if (this.previousPigHolder) {
            const index = this.players.findIndex(p => p.id === this.previousPigHolder);
            if (index !== -1) return index;
        }

        // First round: find holder of 2 of spades
        for (let i = 0; i < this.players.length; i++) {
            const hand = this.hands[this.players[i].id];
            if (hand.some(c => c.suit === 'spades' && c.rank === '2')) {
                return i;
            }
        }
        return 0;
    }

    getValidCards(playerId) {
        const hand = this.hands[playerId];
        if (!hand || hand.length === 0) return [];

        // If leading, can play any card
        if (this.currentTrick.length === 0) {
            return hand;
        }

        // Must follow suit if possible
        const suitCards = hand.filter(c => c.suit === this.leadSuit);

        if (suitCards.length > 0) {
            return suitCards;
        }

        // Cannot follow suit - can play anything
        return hand;
    }

    playCard(playerId, cardId) {
        if (this.gamePhase !== 'playing') return { success: false, error: 'Not in playing phase' };

        const currentPlayer = this.players[this.currentPlayerIndex];
        if (currentPlayer.id !== playerId) {
            return { success: false, error: 'Not your turn' };
        }

        const hand = this.hands[playerId];
        const cardIndex = hand.findIndex(c => c.id === cardId);
        if (cardIndex === -1) {
            return { success: false, error: 'Card not in hand' };
        }

        const card = hand[cardIndex];
        const validCards = this.getValidCards(playerId);
        if (!validCards.some(c => c.id === cardId)) {
            return { success: false, error: 'Invalid card selection' };
        }

        // Play the card
        hand.splice(cardIndex, 1);

        // Clear last completed trick when starting a new trick
        if (this.currentTrick.length === 0) {
            this.lastCompletedTrick = [];
        }

        this.currentTrick.push({ playerId, card });

        // Track lead suit
        if (this.currentTrick.length === 1) {
            this.leadSuit = card.suit;
        }

        // Check if trick is complete
        if (this.currentTrick.length === 4) {
            return this.completeTrick();
        }

        // Move to next player (anticlockwise)
        this.currentPlayerIndex = (this.currentPlayerIndex + 3) % 4; // -1 mod 4 = +3 mod 4

        return {
            success: true,
            trickComplete: false,
            nextPlayer: this.players[this.currentPlayerIndex].id
        };
    }

    completeTrick() {
        // Find winner (highest card of lead suit)
        let winningPlay = this.currentTrick[0];
        for (const play of this.currentTrick) {
            if (play.card.suit === this.leadSuit &&
                play.card.getValue() > winningPlay.card.getValue()) {
                winningPlay = play;
            }
        }

        const winnerId = winningPlay.playerId;

        // Add scoring cards to winner's taken tricks
        for (const play of this.currentTrick) {
            if (this.isScoringCard(play.card)) {
                this.tricksTaken[winnerId].push(play.card);
            }
        }

        // Check for pig
        const pigCard = this.currentTrick.find(p => p.card.suit === 'spades' && p.card.rank === 'Q');
        if (pigCard) {
            this.previousPigHolder = winnerId;
        }

        const trickCards = this.currentTrick.map(p => ({ playerId: p.playerId, card: p.card }));
        this.lastCompletedTrick = [...this.currentTrick]; // Store for display
        this.currentTrick = [];
        this.leadSuit = null;

        // Check if round is over
        const roundOver = Object.values(this.hands).every(h => h.length === 0);

        if (roundOver) {
            const roundScores = this.calculateRoundScores();
            return {
                success: true,
                trickComplete: true,
                trickWinner: winnerId,
                trickCards,
                roundOver: true,
                roundScores,
                gameOver: this.checkGameOver()
            };
        }

        // Winner leads next trick
        this.currentPlayerIndex = this.players.findIndex(p => p.id === winnerId);

        return {
            success: true,
            trickComplete: true,
            trickWinner: winnerId,
            trickCards,
            roundOver: false,
            nextPlayer: winnerId
        };
    }

    isScoringCard(card) {
        if (card.suit === 'hearts') return true;
        if (card.suit === 'spades' && card.rank === 'Q') return true;
        if (card.suit === 'diamonds' && card.rank === 'J') return true;
        if (card.suit === 'clubs' && card.rank === '10') return true;
        return false;
    }

    // Calculate current round scores from tricksTaken (for live updates)
    getCurrentRoundScores() {
        const roundScores = {};

        for (const player of this.players) {
            roundScores[player.id] = this.calculatePlayerScore(this.tricksTaken[player.id]);
        }

        return roundScores;
    }

    // Calculate score for a player based on cards taken
    calculatePlayerScore(taken) {
        // Check if player took all hearts (all 13 hearts required)
        const heartsTaken = taken.filter(c => c.suit === 'hearts');
        const hasAllHearts = heartsTaken.length === 13;

        // Check for special cards
        const hasPig = taken.some(c => c.suit === 'spades' && c.rank === 'Q');
        const hasSheep = taken.some(c => c.suit === 'diamonds' && c.rank === 'J');
        const hasClubTen = taken.some(c => c.suit === 'clubs' && c.rank === '10');

        // Calculate base score (before 10 of clubs effect)
        let baseScore = 0;

        // Calculate hearts score
        if (hasAllHearts) {
            // All hearts taken: +200 instead of -200
            baseScore += 200;
            // If also has pig, pig becomes +100 instead of -100
            if (hasPig) {
                baseScore += 100;
            }
        } else {
            // Normal hearts scoring
            for (const card of heartsTaken) {
                baseScore += this.getHeartValue(card);
            }
            // Normal pig penalty
            if (hasPig) {
                baseScore -= 100;
            }
        }

        // Sheep bonus (always +100, even with all hearts)
        if (hasSheep) {
            baseScore += 100;
        }

        // Club ten effect
        // The 10 of clubs has special rules:
        // - If NO other scoring cards taken: +50
        // - If other scoring cards taken: doubles all other scoring cards, but 10 of clubs itself is worth 0
        // Note: Hearts 4, 3, 2 ARE scoring cards even though they score 0
        if (hasClubTen) {
            const otherScoringCards = taken.filter(c =>
                this.isScoringCard(c) && !(c.suit === 'clubs' && c.rank === '10')
            );

            if (otherScoringCards.length === 0) {
                // No other scoring cards - club ten is worth +50
                return baseScore + 50;
            } else {
                // Double the base score (10 of clubs itself contributes 0)
                return baseScore * 2;
            }
        }

        return baseScore;
    }

    calculateRoundScores() {
        const roundScores = {};

        for (const player of this.players) {
            const score = this.calculatePlayerScore(this.tricksTaken[player.id]);
            roundScores[player.id] = score;
            this.scores[player.id] += score;
        }

        return roundScores;
    }

    getHeartValue(card) {
        if (card.suit !== 'hearts') return 0;

        switch (card.rank) {
            case 'A': return -50;
            case 'K': return -40;
            case 'Q': return -30;
            case 'J': return -20;
            case '10': return -10;
            case '9': return -9;
            case '8': return -8;
            case '7': return -7;
            case '6': return -6;
            case '5': return -5;
            case '4': return -4;
            case '3': return -3;
            case '2': return -2;
            default: return 0;
        }
    }

    checkGameOver() {
        for (const player of this.players) {
            if (this.scores[player.id] <= this.targetScore) {
                return {
                    gameOver: true,
                    loser: player.id
                };
            }
        }
        return { gameOver: false };
    }

    startNewRound() {
        this.roundNumber++;
        this.startGame();
    }

    getGameState(forPlayerId = null) {
        // Get current round scores for live updates
        const currentRoundScores = this.gamePhase === 'playing' ? this.getCurrentRoundScores() : {};

        const state = {
            roomId: this.roomId,
            players: this.players.map(p => ({
                id: p.id,
                name: p.name,
                avatar: p.avatar,
                isBot: p.isBot,
                score: this.scores[p.id],
                roundScore: currentRoundScores[p.id] || 0,
                cardCount: this.hands[p.id]?.length || 0,
                tricksTaken: this.tricksTaken[p.id] || []
            })),
            gamePhase: this.gamePhase,
            currentPlayerIndex: this.currentPlayerIndex,
            currentPlayerId: this.players[this.currentPlayerIndex]?.id,
            currentTrick: this.currentTrick,
            lastCompletedTrick: this.lastCompletedTrick,
            leadSuit: this.leadSuit,
            roundNumber: this.roundNumber
        };

        // Only send hand to the requesting player
        if (forPlayerId && this.hands[forPlayerId]) {
            state.hand = this.hands[forPlayerId];
            state.validCards = this.gamePhase === 'playing' &&
                this.players[this.currentPlayerIndex]?.id === forPlayerId
                ? this.getValidCards(forPlayerId)
                : [];
        }

        return state;
    }
}

module.exports = { GongZhuGame, Card, Deck, SUITS, RANKS };
