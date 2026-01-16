// Bot AI for Gong Zhu Game
const BOT_NAMES = [
    'Dragon Bot', 'Phoenix Bot', 'Tiger Bot', 'Turtle Bot',
    'Panda Bot', 'Crane Bot', 'Snake Bot', 'Monkey Bot'
];

const BOT_AVATARS = [
    '🤖', '🐉', '🐦', '🐯', '🐢', '🐼', '🦅', '🐍'
];

class Bot {
    constructor(id, name = null, avatar = null) {
        this.id = id;
        this.name = name || BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
        this.avatar = avatar || BOT_AVATARS[Math.floor(Math.random() * BOT_AVATARS.length)];
        this.isBot = true;
        this.difficulty = 'medium'; // easy, medium, hard
    }

    // Decide whether to expose a card
    decideExpose(hand, exposedCards) {
        const decisions = [];
        
        // Check each exposable card
        const exposables = [
            { suit: 'hearts', rank: 'A' },
            { suit: 'spades', rank: 'Q' },
            { suit: 'diamonds', rank: 'J' },
            { suit: 'clubs', rank: '10' }
        ];

        for (const exp of exposables) {
            const hasCard = hand.some(c => c.suit === exp.suit && c.rank === exp.rank);
            if (!hasCard) continue;

            // Strategy based on difficulty
            if (this.difficulty === 'easy') {
                // Easy bots expose randomly
                if (Math.random() > 0.7) {
                    decisions.push(exp);
                }
            } else if (this.difficulty === 'medium') {
                // Medium bots use basic strategy
                if (exp.suit === 'diamonds' && exp.rank === 'J') {
                    // Usually expose sheep for bonus
                    if (Math.random() > 0.3) decisions.push(exp);
                } else if (exp.suit === 'clubs' && exp.rank === '10') {
                    // Expose club ten if we have many clubs
                    const clubCount = hand.filter(c => c.suit === 'clubs').length;
                    if (clubCount >= 4 && Math.random() > 0.4) decisions.push(exp);
                } else if (exp.suit === 'spades' && exp.rank === 'Q') {
                    // Rarely expose pig unless have few spades
                    const spadeCount = hand.filter(c => c.suit === 'spades').length;
                    if (spadeCount <= 2 && Math.random() > 0.6) decisions.push(exp);
                } else if (exp.suit === 'hearts' && exp.rank === 'A') {
                    // Expose heart ace if going for all hearts
                    const heartCount = hand.filter(c => c.suit === 'hearts').length;
                    if (heartCount >= 8 && Math.random() > 0.5) decisions.push(exp);
                }
            } else {
                // Hard bots use advanced strategy
                // Implement more sophisticated logic here
                if (exp.suit === 'diamonds' && exp.rank === 'J') {
                    const diamondCount = hand.filter(c => c.suit === 'diamonds').length;
                    const lowDiamonds = hand.filter(c => c.suit === 'diamonds' && 
                        ['2', '3', '4', '5', '6'].includes(c.rank)).length;
                    if (diamondCount >= 3 && lowDiamonds >= 1) decisions.push(exp);
                }
            }
        }

        return decisions;
    }

    // Choose a card to play
    chooseCard(validCards, gameState) {
        if (validCards.length === 0) return null;
        if (validCards.length === 1) return validCards[0];

        const { currentTrick, leadSuit, tricksTaken } = gameState;
        const isLeading = currentTrick.length === 0;

        if (this.difficulty === 'easy') {
            return this.chooseCardEasy(validCards, gameState);
        } else if (this.difficulty === 'medium') {
            return this.chooseCardMedium(validCards, gameState);
        } else {
            return this.chooseCardHard(validCards, gameState);
        }
    }

    chooseCardEasy(validCards, gameState) {
        // Easy bot plays randomly
        return validCards[Math.floor(Math.random() * validCards.length)];
    }

    chooseCardMedium(validCards, gameState) {
        const { currentTrick, leadSuit } = gameState;
        const isLeading = currentTrick.length === 0;

        // Categorize cards
        const dangerCards = validCards.filter(c => this.isDangerCard(c));
        const safeCards = validCards.filter(c => !this.isDangerCard(c));
        const bonusCards = validCards.filter(c => this.isBonusCard(c));

        if (isLeading) {
            // When leading, try to play safe low cards
            const nonScoring = validCards.filter(c => !this.isScoringCard(c));
            if (nonScoring.length > 0) {
                // Play lowest non-scoring card
                return this.getLowestCard(nonScoring);
            }
            return this.getLowestCard(validCards);
        }

        // Following suit
        const followingSuit = validCards.some(c => c.suit === leadSuit);
        
        if (followingSuit) {
            // Try to duck under danger cards in trick
            const dangerInTrick = currentTrick.some(p => this.isDangerCard(p.card));
            if (dangerInTrick) {
                // Play lowest to avoid taking
                return this.getLowestCard(validCards);
            }

            // Check if sheep is in trick and we can win it
            const sheepInTrick = currentTrick.some(p => 
                p.card.suit === 'diamonds' && p.card.rank === 'J');
            if (sheepInTrick && leadSuit === 'diamonds') {
                // Try to win the sheep
                return this.getHighestCard(validCards);
            }

            // Default: play middle card
            return this.getMiddleCard(validCards);
        } else {
            // Can't follow suit - dump danger cards
            if (dangerCards.length > 0) {
                // Dump pig first, then high hearts
                const pig = dangerCards.find(c => c.suit === 'spades' && c.rank === 'Q');
                if (pig) return pig;
                
                const hearts = dangerCards.filter(c => c.suit === 'hearts');
                if (hearts.length > 0) {
                    return this.getHighestCard(hearts);
                }
                
                return dangerCards[0];
            }

            // Play safe card
            if (safeCards.length > 0) {
                return this.getLowestCard(safeCards);
            }

            return validCards[0];
        }
    }

    chooseCardHard(validCards, gameState) {
        // Hard bot uses same as medium but with more considerations
        // Could be expanded with card counting, probability analysis, etc.
        return this.chooseCardMedium(validCards, gameState);
    }

    isDangerCard(card) {
        if (card.suit === 'spades' && card.rank === 'Q') return true;
        if (card.suit === 'hearts' && ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5'].includes(card.rank)) return true;
        return false;
    }

    isBonusCard(card) {
        if (card.suit === 'diamonds' && card.rank === 'J') return true;
        if (card.suit === 'clubs' && card.rank === '10') return true;
        return false;
    }

    isScoringCard(card) {
        if (card.suit === 'hearts') return true;
        if (card.suit === 'spades' && card.rank === 'Q') return true;
        if (card.suit === 'diamonds' && card.rank === 'J') return true;
        if (card.suit === 'clubs' && card.rank === '10') return true;
        return false;
    }

    getLowestCard(cards) {
        return cards.reduce((lowest, card) => 
            card.getValue() < lowest.getValue() ? card : lowest
        );
    }

    getHighestCard(cards) {
        return cards.reduce((highest, card) => 
            card.getValue() > highest.getValue() ? card : highest
        );
    }

    getMiddleCard(cards) {
        const sorted = [...cards].sort((a, b) => a.getValue() - b.getValue());
        return sorted[Math.floor(sorted.length / 2)];
    }
}

function createBot(id) {
    return new Bot(id);
}

module.exports = { Bot, createBot, BOT_NAMES, BOT_AVATARS };
