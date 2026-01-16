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
    constructor(roomId) {
        this.roomId = roomId;
        this.players = [];
        this.deck = new Deck();
        this.hands = {};
        this.currentTrick = [];
        this.currentPlayerIndex = 0;
        this.leadSuit = null;
        this.scores = {};
        this.tricksTaken = {};
        this.exposedCards = {};
        this.gamePhase = 'waiting'; // waiting, exposing, playing, finished
        this.previousPigHolder = null;
        this.roundNumber = 1;
        this.suitLedBefore = { hearts: false, diamonds: false, clubs: false, spades: false };
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
            this.exposedCards[player.id] = [];
        });

        this.suitLedBefore = { hearts: false, diamonds: false, clubs: false, spades: false };
        this.gamePhase = 'exposing';
        this.currentTrick = [];
        this.leadSuit = null;

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

    startPlaying() {
        this.gamePhase = 'playing';
        this.currentPlayerIndex = this.findStartingPlayer();
        return this.currentPlayerIndex;
    }

    canExposeCard(playerId, card) {
        const exposableCards = [
            { suit: 'hearts', rank: 'A' },
            { suit: 'spades', rank: 'Q' },
            { suit: 'diamonds', rank: 'J' },
            { suit: 'clubs', rank: '10' }
        ];

        const hand = this.hands[playerId];
        const hasCard = hand.some(c => c.suit === card.suit && c.rank === card.rank);
        const isExposable = exposableCards.some(e => e.suit === card.suit && e.rank === card.rank);
        const notAlreadyExposed = !this.exposedCards[playerId].some(c => c.suit === card.suit && c.rank === card.rank);

        return hasCard && isExposable && notAlreadyExposed;
    }

    exposeCard(playerId, card) {
        if (this.gamePhase !== 'exposing') return false;
        if (!this.canExposeCard(playerId, card)) return false;

        this.exposedCards[playerId].push(card);
        return true;
    }

    getValidCards(playerId) {
        const hand = this.hands[playerId];
        if (!hand || hand.length === 0) return [];

        // If leading
        if (this.currentTrick.length === 0) {
            // Check for exposed cards restrictions
            const validCards = hand.filter(card => {
                const isExposed = this.exposedCards[playerId].some(
                    e => e.suit === card.suit && e.rank === card.rank
                );
                if (isExposed && !this.suitLedBefore[card.suit]) {
                    // Can only lead exposed card if it's the only card of that suit
                    const suitCards = hand.filter(c => c.suit === card.suit);
                    return suitCards.length === 1;
                }
                return true;
            });
            return validCards.length > 0 ? validCards : hand;
        }

        // Must follow suit if possible
        const suitCards = hand.filter(c => c.suit === this.leadSuit);
        
        if (suitCards.length > 0) {
            // Check exposed card restrictions
            const validCards = suitCards.filter(card => {
                const isExposed = this.exposedCards[playerId].some(
                    e => e.suit === card.suit && e.rank === card.rank
                );
                if (isExposed && !this.suitLedBefore[card.suit]) {
                    // Cannot play exposed card on first trick of suit unless no choice
                    return suitCards.length === 1;
                }
                return true;
            });
            return validCards.length > 0 ? validCards : suitCards;
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
        this.currentTrick.push({ playerId, card });

        // Track lead suit
        if (this.currentTrick.length === 1) {
            this.leadSuit = card.suit;
            this.suitLedBefore[card.suit] = true;
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

    calculateRoundScores() {
        const roundScores = {};
        
        for (const player of this.players) {
            const taken = this.tricksTaken[player.id];
            let score = 0;
            
            // Check if player took all hearts
            const heartsTaken = taken.filter(c => c.suit === 'hearts');
            const hasAllHearts = heartsTaken.length === 13;
            
            // Check for pig and sheep
            const hasPig = taken.some(c => c.suit === 'spades' && c.rank === 'Q');
            const hasSheep = taken.some(c => c.suit === 'diamonds' && c.rank === 'J');
            const hasClubTen = taken.some(c => c.suit === 'clubs' && c.rank === '10');
            
            // Check exposed cards multipliers
            const allExposed = Object.values(this.exposedCards).flat();
            const heartAceExposed = allExposed.some(c => c.suit === 'hearts' && c.rank === 'A');
            const pigExposed = allExposed.some(c => c.suit === 'spades' && c.rank === 'Q');
            const sheepExposed = allExposed.some(c => c.suit === 'diamonds' && c.rank === 'J');
            const clubTenExposed = allExposed.some(c => c.suit === 'clubs' && c.rank === '10');
            
            // Calculate hearts score
            let heartsScore = 0;
            for (const card of heartsTaken) {
                const value = this.getHeartValue(card);
                heartsScore += value;
            }
            
            if (hasAllHearts) {
                heartsScore = 200; // Positive if all hearts taken
                if (hasPig) {
                    score += 100; // Pig becomes positive
                } else if (hasPig === false && taken.some(c => c.suit === 'spades' && c.rank === 'Q') === false) {
                    // Don't add pig penalty
                }
            } else {
                // Normal pig penalty
                if (hasPig) {
                    score -= 100;
                    if (pigExposed) score -= 100; // Double
                }
            }
            
            if (heartAceExposed) {
                heartsScore *= 2;
            }
            
            score += heartsScore;
            
            // Sheep bonus
            if (hasSheep) {
                let sheepValue = 100;
                if (sheepExposed) sheepValue = 200;
                score += sheepValue;
            }
            
            // Club ten effect
            if (hasClubTen) {
                const otherScoringCards = taken.filter(c => 
                    !(c.suit === 'clubs' && c.rank === '10')
                );
                
                if (otherScoringCards.length === 0) {
                    // No other scoring cards - club ten is worth +50 (or +100 if exposed)
                    score += clubTenExposed ? 100 : 50;
                } else {
                    // Double (or quadruple if exposed) the score
                    const multiplier = clubTenExposed ? 4 : 2;
                    score = score * multiplier;
                }
            }
            
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
            case '10':
            case '9':
            case '8':
            case '7':
            case '6':
            case '5':
                return -10;
            case '4':
            case '3':
            case '2':
                return 0;
            default:
                return 0;
        }
    }

    checkGameOver() {
        for (const player of this.players) {
            if (this.scores[player.id] <= -1000) {
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
        const state = {
            roomId: this.roomId,
            players: this.players.map(p => ({
                id: p.id,
                name: p.name,
                avatar: p.avatar,
                isBot: p.isBot,
                score: this.scores[p.id],
                cardCount: this.hands[p.id]?.length || 0,
                exposedCards: this.exposedCards[p.id] || [],
                tricksTaken: this.tricksTaken[p.id] || []
            })),
            gamePhase: this.gamePhase,
            currentPlayerIndex: this.currentPlayerIndex,
            currentPlayerId: this.players[this.currentPlayerIndex]?.id,
            currentTrick: this.currentTrick,
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
