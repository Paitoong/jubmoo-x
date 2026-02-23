// Bot AI for Gong Zhu Game — Strategic AI
// Goal: Maximize own positive score, minimize negative score, force opponents into penalties

const RANK_VALUES = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };

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
        this.difficulty = 'hard';

        // ─── Per-round opponent tracking ───
        this.resetRoundTracking();
    }

    // ─── Reset all tracked info at the start of each round ───
    resetRoundTracking() {
        // Suits each opponent is known to be void in (discarded off-suit)
        this.opponentVoidSuits = {};  // { playerId: Set<suit> }
        // Cards each opponent has played this round
        this.opponentPlayedCards = {}; // { playerId: [card, ...] }
        // Full trick history for this round
        this.trickHistory = [];        // [ { leadSuit, plays: [{playerId, card}], winnerId } ]
        // Track which specific scoring cards opponents have taken
        this.opponentScoringCardsTaken = {}; // { playerId: [card, ...] }
        // Count of cards remaining per opponent (starts at 13)
        this.opponentCardCounts = {};  // { playerId: number }
    }

    // ─── Record a completed trick — called after every trick finishes ───
    recordTrick(trickPlays, leadSuit, winnerId) {
        // trickPlays: [{playerId, card}, ...]
        if (!trickPlays || trickPlays.length === 0) return;

        // Store trick in history
        this.trickHistory.push({ leadSuit, plays: trickPlays, winnerId });

        for (const play of trickPlays) {
            const pid = play.playerId;
            if (pid === this.id) continue; // skip self

            // Initialize per-player tracking if needed
            if (!this.opponentPlayedCards[pid]) this.opponentPlayedCards[pid] = [];
            if (!this.opponentVoidSuits[pid]) this.opponentVoidSuits[pid] = new Set();
            if (!this.opponentScoringCardsTaken[pid]) this.opponentScoringCardsTaken[pid] = [];
            if (this.opponentCardCounts[pid] === undefined) this.opponentCardCounts[pid] = 13;

            // Record the card played
            this.opponentPlayedCards[pid].push(play.card);
            this.opponentCardCounts[pid] = Math.max(0, this.opponentCardCounts[pid] - 1);

            // Detect void: if opponent played off-suit when not leading
            if (play.card.suit !== leadSuit && trickPlays[0].playerId !== pid) {
                this.opponentVoidSuits[pid].add(leadSuit);
            }
        }

        // Track scoring cards taken by winner
        if (winnerId !== this.id) {
            if (!this.opponentScoringCardsTaken[winnerId]) this.opponentScoringCardsTaken[winnerId] = [];
            for (const play of trickPlays) {
                if (this.isScoringCard(play.card)) {
                    this.opponentScoringCardsTaken[winnerId].push(play.card);
                }
            }
        }
    }

    // ─── Opponent analysis helpers using tracked data ───

    // Check if a specific opponent is void in a suit
    isOpponentVoidIn(playerId, suit) {
        return this.opponentVoidSuits[playerId]?.has(suit) || false;
    }

    // Get all opponents known to be void in a suit
    getOpponentsVoidIn(suit) {
        const voidPlayers = [];
        for (const [pid, voids] of Object.entries(this.opponentVoidSuits)) {
            if (voids.has(suit)) voidPlayers.push(pid);
        }
        return voidPlayers;
    }

    // Count how many opponents are void in a suit
    countOpponentsVoidIn(suit) {
        return this.getOpponentsVoidIn(suit).length;
    }

    // Check if any opponent void in a suit still holds penalty cards (hearts/pig)
    // This means leading that suit is dangerous — they'll dump penalties on the winner
    isLeadDangerous(suit, tricksTaken) {
        const voidOpponents = this.getOpponentsVoidIn(suit);
        for (const pid of voidOpponents) {
            // Check if this void opponent likely still holds hearts or pig
            const playedHearts = (this.opponentPlayedCards[pid] || []).filter(c => c.suit === 'hearts');
            const playedPig = (this.opponentPlayedCards[pid] || []).some(c => this.isPig(c));
            const cardsLeft = this.opponentCardCounts[pid] || 0;

            // If they haven't dumped many penalties and still have cards, it's risky
            if (cardsLeft > 0 && !playedPig) return true;
            if (cardsLeft > 2 && playedHearts.length < 3) return true;
        }
        return false;
    }

    // Estimate how many cards of a suit an opponent may still hold
    estimateOpponentSuitCount(playerId, suit) {
        if (this.isOpponentVoidIn(playerId, suit)) return 0;
        const played = (this.opponentPlayedCards[playerId] || []).filter(c => c.suit === suit).length;
        const avgPerSuit = 3.25; // 13 cards / 4 suits
        return Math.max(0, Math.round(avgPerSuit - played));
    }

    // Find the safest suit to lead based on opponent void information
    getSafestLeadSuit(validCards, tricksTaken) {
        const suitRisk = {};
        const suits = [...new Set(validCards.filter(c => !this.isScoringCard(c)).map(c => c.suit))];

        for (const suit of suits) {
            let risk = 0;
            const voidCount = this.countOpponentsVoidIn(suit);
            risk += voidCount * 10; // each void opponent is risky

            // Extra risk if pig is still out and opponents void in this suit hold it
            if (this.pigIsStillOut(tricksTaken, [])) {
                for (const pid of this.getOpponentsVoidIn(suit)) {
                    const playedPig = (this.opponentPlayedCards[pid] || []).some(c => this.isPig(c));
                    if (!playedPig) risk += 5;
                }
            }
            suitRisk[suit] = risk;
        }

        // Return the least risky suit
        const sorted = Object.entries(suitRisk).sort((a, b) => a[1] - b[1]);
        return sorted.length > 0 ? sorted[0][0] : null;
    }

    // Check if an opponent is likely collecting all hearts (sweep attempt)
    isOpponentAttemptingSweep(playerId, tricksTaken) {
        const theirHearts = (tricksTaken[playerId] || []).filter(c => c.suit === 'hearts').length;
        const totalHearts = this.countHeartsTaken(tricksTaken);
        // If one opponent has ALL hearts taken so far and it's significant
        return theirHearts === totalHearts && theirHearts >= 4;
    }

    // Find opponent most likely to be sweeping hearts
    findSweepingOpponent(tricksTaken) {
        for (const pid of Object.keys(tricksTaken)) {
            if (pid === this.id) continue;
            if (this.isOpponentAttemptingSweep(pid, tricksTaken)) return pid;
        }
        return null;
    }

    // ─── Card value helpers ───
    cardValue(card) {
        return RANK_VALUES[card.rank] || 0;
    }

    getLowestCard(cards) {
        return cards.reduce((lo, c) => this.cardValue(c) < this.cardValue(lo) ? c : lo);
    }

    getHighestCard(cards) {
        return cards.reduce((hi, c) => this.cardValue(c) > this.cardValue(hi) ? c : hi);
    }

    // Get highest card that is still lower than a target value
    getHighestCardBelow(cards, targetValue) {
        const below = cards.filter(c => this.cardValue(c) < targetValue);
        return below.length > 0 ? this.getHighestCard(below) : null;
    }

    // ─── Card classification ───
    isPig(c) { return c.suit === 'spades' && c.rank === 'Q'; }
    isSheep(c) { return c.suit === 'diamonds' && c.rank === 'J'; }
    isClubTen(c) { return c.suit === 'clubs' && c.rank === '10'; }
    isHeart(c) { return c.suit === 'hearts'; }

    isScoringCard(c) {
        return this.isHeart(c) || this.isPig(c) || this.isSheep(c) || this.isClubTen(c);
    }

    isDangerCard(c) {
        return this.isPig(c) || (this.isHeart(c) && this.cardValue(c) >= 5);
    }

    getHeartPenalty(card) {
        if (card.suit !== 'hearts') return 0;
        const penalties = { 'A': -50, 'K': -40, 'Q': -30, 'J': -20, '10': -10, '9': -9, '8': -8, '7': -7, '6': -6, '5': -5, '4': -4, '3': -3, '2': -2 };
        return penalties[card.rank] || 0;
    }

    // Negative penalty value of a card (how bad it is to take it)
    cardPenalty(c) {
        if (this.isPig(c)) return -100;
        if (this.isHeart(c)) return this.getHeartPenalty(c);
        return 0;
    }

    // Returns true when the pig/sheep swap rule is active:
    // someone has all hearts in tricksTaken but did NOT achieve a grand slam.
    // In that case pig = +100, sheep = -100 for the round.
    isSwapActive(tricksTaken) {
        for (const [pid, taken] of Object.entries(tricksTaken)) {
            const heartCount = taken.filter(c => c.suit === 'hearts').length;
            if (heartCount < 13) continue; // this player does not have all hearts
            // Check if they also have all three special cards (grand slam)
            const hasPig = taken.some(c => this.isPig(c));
            const hasSheep = taken.some(c => this.isSheep(c));
            const hasClubTen = taken.some(c => this.isClubTen(c));
            if (!(hasPig && hasSheep && hasClubTen)) return true; // swap active
        }
        return false;
    }

    // Context-aware card value: respects the pig/sheep swap rule.
    // Returns the effective score delta of taking a card given current tricksTaken.
    effectiveCardPenalty(card, tricksTaken) {
        const swapActive = this.isSwapActive(tricksTaken);
        if (swapActive) {
            if (this.isPig(card)) return +100; // pig is a bonus when swap active
            if (this.isSheep(card)) return -100; // sheep is a penalty when swap active
        }
        return this.cardPenalty(card);
    }

    // Check if an opponent has taken all hearts so far and none by others
    // (sheep becomes -100 for us if they complete the sweep)
    opponentHasAllHearts(tricksTaken) {
        for (const pid of Object.keys(tricksTaken)) {
            if (pid === this.id) continue;
            const hearts = (tricksTaken[pid] || []).filter(c => c.suit === 'hearts');
            if (hearts.length === 13) return pid;
        }
        return null;
    }

    // ─── Trick analysis ───
    trickHasScoringCards(trick) {
        return trick.some(p => this.isScoringCard(p.card));
    }

    trickPenalty(trick) {
        return trick.reduce((sum, p) => sum + this.cardPenalty(p.card), 0);
    }

    trickHasPig(trick) {
        return trick.some(p => this.isPig(p.card));
    }

    trickHasSheep(trick) {
        return trick.some(p => this.isSheep(p.card));
    }

    trickHasClubTen(trick) {
        return trick.some(p => this.isClubTen(p.card));
    }

    // Who is currently winning the trick?
    currentTrickWinner(trick, leadSuit) {
        if (trick.length === 0) return null;
        let winner = trick[0];
        for (const play of trick) {
            if (play.card.suit === leadSuit && this.cardValue(play.card) > this.cardValue(winner.card)) {
                winner = play;
            }
        }
        return winner;
    }

    // Would this card win the current trick?
    wouldWinTrick(card, trick, leadSuit) {
        if (card.suit !== leadSuit) return false;
        const currentWinner = this.currentTrickWinner(trick, leadSuit);
        if (!currentWinner) return true;
        return this.cardValue(card) > this.cardValue(currentWinner.card);
    }

    // ─── Card counting & awareness ───
    getPlayedCards(tricksTaken, currentTrick) {
        const played = [];
        for (const pid of Object.keys(tricksTaken)) {
            played.push(...tricksTaken[pid]);
        }
        for (const p of currentTrick) {
            played.push(p.card);
        }
        return played;
    }

    getRemainingCardsInSuit(suit, hand, tricksTaken, currentTrick) {
        const played = this.getPlayedCards(tricksTaken, currentTrick);
        const playedIds = new Set(played.map(c => c.id));
        const myIds = new Set(hand.map(c => c.id));
        const allRanks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
        return allRanks
            .map(r => ({ suit, rank: r, id: `${r}_${suit}`, getValue: () => RANK_VALUES[r] }))
            .filter(c => !playedIds.has(c.id) && !myIds.has(c.id));
    }

    // ─── Pig (Q♠) avoidance planning ───
    // Check if bot is at risk of taking the pig
    pigIsStillOut(tricksTaken, currentTrick) {
        return !this.isCardPlayed('Q', 'spades', tricksTaken, currentTrick);
    }

    // Check if playing a spade card risks winning the pig
    spadeRisksWinningPig(card, hand, tricksTaken, currentTrick) {
        if (card.suit !== 'spades') return false;
        if (!this.pigIsStillOut(tricksTaken, currentTrick)) return false;
        // K♠ and A♠ are above Q♠, so they'd win a trick containing the pig
        return this.cardValue(card) > 12; // K=13, A=14
    }

    // Count spades in hand (excluding pig itself)
    countSpadesInHand(hand) {
        return hand.filter(c => c.suit === 'spades' && !this.isPig(c)).length;
    }

    // Check how many spades opponents might still hold (not played, not in our hand)
    countOutstandingSpades(hand, tricksTaken, currentTrick) {
        return this.getRemainingCardsInSuit('spades', hand, tricksTaken, currentTrick);
    }

    // ─── Sheep (J♦) capture planning ───
    // Check if sheep is still available to capture
    sheepIsStillOut(tricksTaken, currentTrick) {
        return !this.isCardPlayed('J', 'diamonds', tricksTaken, currentTrick);
    }

    // Check if bot holds the sheep
    botHoldsSheep(hand) {
        return hand.some(c => this.isSheep(c));
    }

    // Count how many diamonds higher than J (Q=12, K=13, A=14) are still out there
    countDiamondsAboveSheep(hand, tricksTaken, currentTrick) {
        const remaining = this.getRemainingCardsInSuit('diamonds', hand, tricksTaken, currentTrick);
        return remaining.filter(c => this.cardValue(c) > 11).length; // Q, K, A of diamonds
    }

    // Check if bot holds diamonds above J♦ to protect/win it
    botHasDiamondsAboveSheep(hand) {
        return hand.filter(c => c.suit === 'diamonds' && this.cardValue(c) > 11); // Q, K, A
    }

    // Check if it's safe to lead the sheep (few or no higher diamonds remaining)
    isSafeToLeadSheep(hand, tricksTaken, currentTrick) {
        const higherDiamondsOut = this.countDiamondsAboveSheep(hand, tricksTaken, currentTrick);
        return higherDiamondsOut === 0;
    }

    // Count how many hearts have been taken across all players
    countHeartsTaken(tricksTaken) {
        let count = 0;
        for (const pid of Object.keys(tricksTaken)) {
            count += tricksTaken[pid].filter(c => c.suit === 'hearts').length;
        }
        return count;
    }

    // Count how many hearts the bot has taken
    myHeartsTaken(tricksTaken, botId) {
        return (tricksTaken[botId] || []).filter(c => c.suit === 'hearts').length;
    }

    // Check if bot is on track for collecting ALL hearts (sweep strategy)
    // All hearts sweep: +194 instead of -194; with pig: +294 total
    canAttemptHeartsSweep(hand, tricksTaken, botId) {
        const myHearts = this.myHeartsTaken(tricksTaken, botId);
        const heartsInHand = hand.filter(c => c.suit === 'hearts').length;
        const totalHeartsTaken = this.countHeartsTaken(tricksTaken);

        // Others have taken hearts — sweep is impossible
        const othersHearts = totalHeartsTaken - myHearts;
        if (othersHearts > 0) return false;

        // Bot has all hearts taken so far AND holds many hearts in hand
        // Need high hearts or enough volume to feasibly collect remaining
        return (myHearts + heartsInHand >= 8);
    }

    // ─── Grand Slam detection (+1000 for all hearts + pig + sheep + club ten) ───
    canAttemptGrandSlam(hand, tricksTaken, botId) {
        // First, must be able to sweep all hearts
        if (!this.canAttemptHeartsSweep(hand, tricksTaken, botId)) return false;

        const myTaken = tricksTaken[botId] || [];

        // Check pig (Q♠): must hold it or have taken it; must not be taken by opponent
        const hasPig = hand.some(c => this.isPig(c)) || myTaken.some(c => this.isPig(c));
        const pigTakenByOther = Object.entries(tricksTaken).some(
            ([pid, cards]) => pid !== botId && cards.some(c => this.isPig(c))
        );
        if (!hasPig && pigTakenByOther) return false;

        // Check sheep (J♦): must hold it or have taken it; must not be taken by opponent
        const hasSheep = hand.some(c => this.isSheep(c)) || myTaken.some(c => this.isSheep(c));
        const sheepTakenByOther = Object.entries(tricksTaken).some(
            ([pid, cards]) => pid !== botId && cards.some(c => this.isSheep(c))
        );
        if (!hasSheep && sheepTakenByOther) return false;

        // Check club ten (10♣): must hold it or have taken it; must not be taken by opponent
        const hasClubTen = hand.some(c => this.isClubTen(c)) || myTaken.some(c => this.isClubTen(c));
        const clubTenTakenByOther = Object.entries(tricksTaken).some(
            ([pid, cards]) => pid !== botId && cards.some(c => this.isClubTen(c))
        );
        if (!hasClubTen && clubTenTakenByOther) return false;

        // If pig/sheep/club ten are still unplayed and we don't hold them, it's too uncertain
        if (!hasPig && !pigTakenByOther) return false;  // pig is out there but not taken — risky unless we hold it
        // Actually, we checked hasPig includes hand, so if we don't have it and nobody took it,
        // it means an opponent holds it — can't guarantee getting it
        if (!hasSheep && !sheepTakenByOther) return false;
        if (!hasClubTen && !clubTenTakenByOther) return false;

        return true;
    }

    // Check if an opponent is attempting a grand slam
    isOpponentAttemptingGrandSlam(playerId, tricksTaken) {
        // Must have all hearts taken so far
        if (!this.isOpponentAttemptingSweep(playerId, tricksTaken)) return false;

        const theirTaken = tricksTaken[playerId] || [];
        const heartCount = theirTaken.filter(c => c.suit === 'hearts').length;
        if (heartCount < 4) return false;  // not far enough along

        // Check if they also hold pig and/or sheep and club ten
        const hasPig = theirTaken.some(c => this.isPig(c));
        const hasSheep = theirTaken.some(c => this.isSheep(c));
        const hasClubTen = theirTaken.some(c => this.isClubTen(c));

        // If they already have 2+ of the big three (pig, sheep, club10) — likely grand slam attempt
        const bigCards = [hasPig, hasSheep, hasClubTen].filter(Boolean).length;
        return bigCards >= 2;
    }

    // Find opponent most likely attempting a grand slam
    findGrandSlamOpponent(tricksTaken) {
        for (const pid of Object.keys(tricksTaken)) {
            if (pid === this.id) continue;
            if (this.isOpponentAttemptingGrandSlam(pid, tricksTaken)) return pid;
        }
        return null;
    }

    // ─── Main decision function ───
    chooseCard(validCards, gameState) {
        if (validCards.length === 0) return null;
        if (validCards.length === 1) return validCards[0];

        const { currentTrick, leadSuit, tricksTaken, botId, hand } = gameState;
        const isLeading = currentTrick.length === 0;
        const fullHand = hand || validCards;
        const isGrandSlam = this.canAttemptGrandSlam(fullHand, tricksTaken, botId);
        const isSweeping = isGrandSlam || this.canAttemptHeartsSweep(fullHand, tricksTaken, botId);

        if (isLeading) {
            return this.chooseLead(validCards, gameState, isSweeping, isGrandSlam);
        } else {
            const followingSuit = validCards.some(c => c.suit === leadSuit);
            if (followingSuit) {
                return this.chooseFollow(validCards, gameState, isSweeping, isGrandSlam);
            } else {
                return this.chooseDiscard(validCards, gameState, isSweeping, isGrandSlam);
            }
        }
    }

    // ─── LEADING ───
    chooseLead(validCards, gs, isSweeping, isGrandSlam) {
        const { tricksTaken, botId, hand, currentTrick } = gs;
        const fullHand = hand || validCards;

        // === COUNTER-GRAND-SLAM: highest priority disruption ===
        const grandSlamOpponent = this.findGrandSlamOpponent(tricksTaken);
        if (grandSlamOpponent && !isGrandSlam) {
            // Opponent is close to +1000 — disrupt aggressively!
            // Lead a low heart to break their heart monopoly
            const hearts = validCards.filter(c => this.isHeart(c));
            if (hearts.length > 0) {
                return this.getLowestCard(hearts);
            }
            // Try to take sheep ourselves to block them
            const sheepStillOut = this.sheepIsStillOut(tricksTaken, currentTrick || []);
            if (sheepStillOut && this.botHoldsSheep(fullHand)) {
                if (this.isSafeToLeadSheep(fullHand, tricksTaken, currentTrick || [])) {
                    const sheep = validCards.find(c => this.isSheep(c));
                    if (sheep) return sheep;
                }
            }
        }

        // === COUNTER-SWEEP: if an opponent is sweeping hearts, disrupt! ===
        const sweepingOpponent = !grandSlamOpponent ? this.findSweepingOpponent(tricksTaken) : null;
        if (sweepingOpponent && !isSweeping) {
            // Lead a low heart to take it ourselves and block their sweep
            const hearts = validCards.filter(c => this.isHeart(c));
            if (hearts.length > 0) {
                return this.getLowestCard(hearts); // take a cheap heart to block sweep
            }
        }

        // === SWEEP / GRAND SLAM MODE: lead to collect all scoring cards ===
        if (isSweeping) {
            if (isGrandSlam) {
                // Grand slam: aggressively collect ALL scoring cards
                // Lead high hearts to collect them
                const hearts = validCards.filter(c => this.isHeart(c));
                if (hearts.length > 0) {
                    return this.getHighestCard(hearts);
                }
                // Lead from strongest suit to maintain control and win tricks
                return this.leadStrongestSuit(validCards, gs);
            }
            // Regular sweep: collect hearts
            const hearts = validCards.filter(c => this.isHeart(c));
            if (hearts.length > 0) {
                return this.getHighestCard(hearts);
            }
            return this.leadStrongestSuit(validCards, gs);
        }

        const pigStillOut = this.pigIsStillOut(tricksTaken, currentTrick || []);
        const spades = validCards.filter(c => c.suit === 'spades');
        const hasPig = validCards.some(c => this.isPig(c));

        // === PIG AVOIDANCE: If we hold the pig, prioritize voiding spades or other suits ===
        if (hasPig && pigStillOut) {
            // We hold Q♠ — NEVER lead spades! Lead other suits to create opportunities
            // to discard Q♠ later when we can't follow suit
            const nonSpades = validCards.filter(c => c.suit !== 'spades');
            if (nonSpades.length > 0) {
                // Lead from our shortest non-spade, non-heart suit to void it
                // (voiding suits = more chances to discard pig later)
                const suitCounts = {};
                for (const c of nonSpades) {
                    if (!this.isScoringCard(c)) {
                        if (!suitCounts[c.suit]) suitCounts[c.suit] = [];
                        suitCounts[c.suit].push(c);
                    }
                }
                const shortestSafe = Object.entries(suitCounts)
                    .sort((a, b) => a[1].length - b[1].length);
                if (shortestSafe.length > 0) {
                    return this.getLowestCard(shortestSafe[0][1]);
                }
                // Only scoring cards remain outside spades — lead least damaging
                const nonSpadeNonPig = nonSpades.filter(c => !this.isPig(c));
                if (nonSpadeNonPig.length > 0) {
                    return this.getLeastDamagingCard(nonSpadeNonPig);
                }
            }
            // Only spades in hand — we're forced; lead low spade (not the pig unless forced)
            const lowSpades = spades.filter(c => !this.isPig(c));
            if (lowSpades.length > 0) {
                return this.getLowestCard(lowSpades);
            }
            // Only the pig remains
            return validCards[0];
        }

        // === PIG AVOIDANCE: If we hold K♠ or A♠ and pig is out, void spades carefully ===
        if (pigStillOut && spades.length > 0) {
            const highSpades = spades.filter(c => this.cardValue(c) > 12); // K, A
            if (highSpades.length > 0) {
                // We have K/A spades — DON'T lead spades (we'd win the pig trick)
                // Instead lead other suits
                const nonSpades = validCards.filter(c => c.suit !== 'spades' && !this.isScoringCard(c));
                if (nonSpades.length > 0) {
                    return this.getLowestCard(nonSpades);
                }
            }
        }

        // === Strategy 1: Flush out the pig if we DON'T hold it or high spades ===
        if (!hasPig && spades.length > 0 && pigStillOut) {
            const lowSpades = spades.filter(c => this.cardValue(c) < 12); // below Q
            if (lowSpades.length > 0) {
                // Lead just below Q to force the pig holder to play or hold
                return this.getHighestCard(lowSpades);
            }
        }

        // === SHEEP CAPTURE: Plan to win J♦ (+100) ===
        const sheepStillOut = this.sheepIsStillOut(tricksTaken, currentTrick || []);
        if (sheepStillOut) {
            const diamonds = validCards.filter(c => c.suit === 'diamonds');
            const holdsSheep = this.botHoldsSheep(fullHand);

            if (holdsSheep) {
                // We hold the sheep — plan to play it when safe
                if (this.isSafeToLeadSheep(fullHand, tricksTaken, currentTrick || [])) {
                    // No higher diamonds left among opponents — lead sheep to win it!
                    const sheep = diamonds.find(c => this.isSheep(c));
                    if (sheep && validCards.some(c => this.isSheep(c))) {
                        return sheep;
                    }
                }

                // Still higher diamonds out — drain them first
                if (diamonds.length >= 2) {
                    // Lead high non-sheep diamonds to draw out opponents' Q/K/A diamonds
                    const highDiamonds = diamonds.filter(c => !this.isSheep(c) && this.cardValue(c) > 11);
                    if (highDiamonds.length > 0) {
                        return this.getHighestCard(highDiamonds); // draw out opponents' high diamonds
                    }
                    // Lead low diamonds to drain opponents' diamond supply
                    const lowDiamonds = diamonds.filter(c => !this.isSheep(c) && this.cardValue(c) < 11);
                    if (lowDiamonds.length > 0) {
                        return this.getLowestCard(lowDiamonds);
                    }
                }
                // Sheep is our only diamond — don't lead it yet unless safe
                // Lead other suits instead
            } else {
                // We don't hold sheep — if we have high diamonds (Q/K/A), lead low diamonds
                // to drain opponents, then be ready to win sheep with high diamond later
                const highDiamonds = diamonds.filter(c => this.cardValue(c) > 11);
                if (highDiamonds.length > 0 && diamonds.length >= 2) {
                    const lowDiamonds = diamonds.filter(c => this.cardValue(c) <= 11);
                    if (lowDiamonds.length > 0) {
                        return this.getLowestCard(lowDiamonds);
                    }
                }
            }
        }

        // === Strategy 3: Lead safe low cards — prefer suits where no opponent is void ===
        const safeSuits = this.getSafeLeads(validCards, tricksTaken);
        if (safeSuits.length > 0) {
            // Prioritize suits where no opponent is void (less chance of penalty dumps)
            const safestSuit = this.getSafestLeadSuit(safeSuits, tricksTaken);
            if (safestSuit) {
                const safestCards = safeSuits.filter(c => c.suit === safestSuit);
                if (safestCards.length > 0) {
                    return this.getLowestCard(safestCards);
                }
            }
            return this.getLowestCard(safeSuits);
        }

        // === Strategy 4: Lead from shortest non-heart suit to create voids ===
        // Avoid suits where opponents are void (they'll dump penalties)
        const suitGroups = {};
        for (const c of validCards) {
            if (!this.isScoringCard(c)) {
                if (!suitGroups[c.suit]) suitGroups[c.suit] = [];
                suitGroups[c.suit].push(c);
            }
        }
        const shortSuit = Object.entries(suitGroups)
            .sort((a, b) => {
                // Primary: shortest suit (to void it)
                // Secondary: prefer suits where fewer opponents are void (safer)
                const lenDiff = a[1].length - b[1].length;
                if (lenDiff !== 0) return lenDiff;
                return this.countOpponentsVoidIn(a[0]) - this.countOpponentsVoidIn(b[0]);
            });
        if (shortSuit.length > 0) {
            return this.getLowestCard(shortSuit[0][1]);
        }

        // === Fallback: least damaging scoring card ===
        return this.getLeastDamagingCard(validCards);
    }

    // ─── FOLLOWING SUIT ───
    chooseFollow(validCards, gs, isSweeping, isGrandSlam) {
        const { currentTrick, leadSuit, tricksTaken, botId, hand } = gs;
        const fullHand = hand || validCards;
        const trickPos = currentTrick.length;
        const isLastPlayer = trickPos === 3;
        const penalty = this.trickPenalty(currentTrick);
        const hasSheepInTrick = this.trickHasSheep(currentTrick);
        const hasClubTenInTrick = this.trickHasClubTen(currentTrick);
        const hasPigInTrick = this.trickHasPig(currentTrick);
        const currentWinner = this.currentTrickWinner(currentTrick, leadSuit);
        const currentWinValue = currentWinner ? this.cardValue(currentWinner.card) : 0;
        const pigStillOut = this.pigIsStillOut(tricksTaken, currentTrick);

        // === Tracking-aware risk: will remaining players dump penalties? ===
        const playersYetToPlay = 4 - trickPos - 1; // how many after us
        let dumpRisk = false;
        if (playersYetToPlay > 0 && !isLastPlayer) {
            // Check if any player yet to play is void in lead suit
            const playedIds = new Set(currentTrick.map(p => p.playerId));
            playedIds.add(botId);
            for (const [pid, voids] of Object.entries(this.opponentVoidSuits)) {
                if (!playedIds.has(pid) && voids.has(leadSuit)) {
                    dumpRisk = true;
                    break;
                }
            }
        }

        // === SWEEP / GRAND SLAM MODE: try to win tricks containing scoring cards ===
        if (isSweeping) {
            if (isGrandSlam) {
                // Grand slam mode: win ANY trick containing scoring cards
                const hasScoringCards = this.trickHasScoringCards(currentTrick);
                if (hasScoringCards || leadSuit === 'hearts') {
                    const winners = validCards.filter(c => this.wouldWinTrick(c, currentTrick, leadSuit));
                    if (winners.length > 0) return this.getLowestCard(winners);
                }
                // Also try to win clean tricks to maintain tempo/control
                if (isLastPlayer && !hasScoringCards) {
                    return this.getHighestCard(validCards);
                }
            } else {
                // Regular sweep: focus on hearts
                const heartsInTrick = currentTrick.filter(p => this.isHeart(p.card)).length;
                if (heartsInTrick > 0 || leadSuit === 'hearts') {
                    const winners = validCards.filter(c => this.wouldWinTrick(c, currentTrick, leadSuit));
                    if (winners.length > 0) return this.getLowestCard(winners);
                }
                if (isLastPlayer && !this.trickHasScoringCards(currentTrick)) {
                    return this.getHighestCard(validCards);
                }
            }
        }

        // === PIG AVOIDANCE when following SPADES ===
        if (leadSuit === 'spades' && pigStillOut) {
            // If pig is in this trick — absolutely duck!
            if (hasPigInTrick) {
                const losers = validCards.filter(c => !this.wouldWinTrick(c, currentTrick, leadSuit));
                if (losers.length > 0) {
                    return this.getHighestCard(losers); // play highest card that still loses
                }
                // We're forced to win the pig — play lowest winner
                return this.getLowestCard(validCards);
            }

            // Pig hasn't appeared yet in this trick but is still out
            // If we hold K♠ or A♠, we risk winning a trick where pig appears
            const holdsPig = validCards.some(c => this.isPig(c));
            if (holdsPig) {
                // We have Q♠ in our valid spades — play low spades to save it for discarding later
                const nonPigSpades = validCards.filter(c => !this.isPig(c));
                if (nonPigSpades.length > 0) {
                    return this.getLowestCard(nonPigSpades); // play lowest non-pig spade
                }
                // Only the pig — check if we can play it safely
                // If we're last and no one played higher, we win our own pig (bad!)
                // Play it anyway (forced)
                return validCards[0];
            }

            // We don't hold pig — play carefully to not win a future pig trick
            if (isLastPlayer) {
                // Last to play — pig not in trick, safe to play
                // But if we play high, we might lead next and be vulnerable
                // Play just below current winner if possible
                const safePlay = this.getHighestCardBelow(validCards, currentWinValue);
                if (safePlay) return safePlay;
                return this.getLowestCard(validCards);
            }

            // Not last — play below Q value to avoid winning if pig appears later
            const belowQueen = validCards.filter(c => this.cardValue(c) < 12);
            if (belowQueen.length > 0) {
                return this.getHighestCard(belowQueen); // play highest card below Q
            }
            // All our spades are K or A — play lowest (K rather than A)
            return this.getLowestCard(validCards);
        }

        // === SHEEP CAPTURE when following DIAMONDS ===
        if (leadSuit === 'diamonds') {
            const sheepStillOut = this.sheepIsStillOut(tricksTaken, currentTrick);
            const sheepSweeper = this.findSweepingOpponent(tricksTaken);
            // Swap is active if someone already has all hearts (without grand slam)
            const swapNowActive = this.isSwapActive(tricksTaken);
            // Sheep is dangerous (-100) when swap rule is active or an opponent is sweeping
            const sheepIsDangerous = swapNowActive || !!sheepSweeper;

            if (hasSheepInTrick) {
                if (sheepIsDangerous) {
                    // Sheep = -100 for us under swap/sweep — AVOID winning it!
                    const losers = validCards.filter(c => !this.wouldWinTrick(c, currentTrick, leadSuit));
                    if (losers.length > 0) return this.getHighestCard(losers);
                    return this.getLowestCard(validCards);
                }
                // Sheep is in this trick — TRY TO WIN IT!
                const winners = validCards.filter(c => this.wouldWinTrick(c, currentTrick, leadSuit));
                if (winners.length > 0) {
                    // Win sheep even if there are minor penalties, as long as net positive
                    if (penalty + 100 > 0) {
                        return this.getLowestCard(winners); // win with minimal card
                    }
                }
                // Can't win or too much penalty — play highest loser to save low cards
                const losers = validCards.filter(c => !this.wouldWinTrick(c, currentTrick, leadSuit));
                if (losers.length > 0) return this.getHighestCard(losers);
                return this.getLowestCard(validCards);
            }

            // Sheep not in trick yet
            const holdsSheep = validCards.some(c => this.isSheep(c));
            if (holdsSheep) {
                // We hold sheep in our valid cards (following diamonds)
                // DON'T play the sheep unless it will win (save for when safe)
                const nonSheep = validCards.filter(c => !this.isSheep(c));
                if (nonSheep.length > 0) {
                    // Play a low non-sheep diamond to save sheep for later
                    return this.getLowestCard(nonSheep);
                }
                // Sheep is our only diamond — forced to play it
                // If it can win, that's great! If not, it's still forced
                return validCards[0];
            }

            // We don't hold sheep and it's still out — if we have high diamonds,
            // play high to be ready to win sheep when it appears later
            if (sheepStillOut && isLastPlayer && !this.trickHasScoringCards(currentTrick)) {
                return this.getHighestCard(validCards); // safe to play high
            }
            // Fall through to general logic below
        }

        // === Strategy: Win the sheep (+100) in non-diamond tricks (discarded by opponent) ===
        // But AVOID sheep if swap is active or an opponent is sweeping hearts (sheep = -100 then)
        if (hasSheepInTrick) {
            const sweeper = this.findSweepingOpponent(tricksTaken);
            const swapNow = this.isSwapActive(tricksTaken);
            if (sweeper || swapNow) {
                // Sheep is -100 for us — avoid taking it!
                const losers = validCards.filter(c => !this.wouldWinTrick(c, currentTrick, leadSuit));
                if (losers.length > 0) {
                    return this.getHighestCard(losers);
                }
            } else {
                const winners = validCards.filter(c => this.wouldWinTrick(c, currentTrick, leadSuit));
                if (winners.length > 0) {
                    if (penalty + 100 > 0) {
                        return this.getLowestCard(winners);
                    }
                }
            }
        }

        // === Strategy: Win club ten when trick is clean ===
        if (hasClubTenInTrick && penalty >= 0) {
            const myTaken = tricksTaken[botId] || [];
            const myCurrentPenalty = myTaken.reduce((sum, c) => sum + this.cardPenalty(c), 0);
            if (myCurrentPenalty >= -10) {
                const winners = validCards.filter(c => this.wouldWinTrick(c, currentTrick, leadSuit));
                if (winners.length > 0) {
                    return this.getLowestCard(winners);
                }
            }
        }

        // === Strategy: AVOID penalty tricks (pig or hearts) ===
        if (penalty < 0 || hasPigInTrick) {
            const losers = validCards.filter(c => !this.wouldWinTrick(c, currentTrick, leadSuit));
            if (losers.length > 0) {
                return this.getHighestCard(losers);
            }
            return this.getLowestCard(validCards);
        }

        // === Strategy: Clean trick — play strategically ===
        if (!this.trickHasScoringCards(currentTrick)) {
            if (isLastPlayer) {
                return this.getHighestCard(validCards);
            }
            // If opponents yet to play are void in lead suit, they may dump penalties
            // In that case, avoid winning the trick
            if (dumpRisk) {
                const safePlay = this.getHighestCardBelow(validCards, currentWinValue);
                if (safePlay) return safePlay;
                return this.getLowestCard(validCards);
            }
            const safePlay = this.getHighestCardBelow(validCards, currentWinValue);
            if (safePlay) return safePlay;
            return this.getLowestCard(validCards);
        }

        // === Default: duck to avoid winning scoring cards ===
        const losers = validCards.filter(c => !this.wouldWinTrick(c, currentTrick, leadSuit));
        if (losers.length > 0) {
            return this.getHighestCard(losers);
        }
        return this.getLowestCard(validCards);
    }

    // ─── DISCARDING (can't follow suit — dump penalties on opponents!) ───
    chooseDiscard(validCards, gs, isSweeping, isGrandSlam) {
        const { currentTrick, leadSuit, tricksTaken, botId, hand } = gs;
        const fullHand = hand || validCards;

        // === COUNTER-GRAND-SLAM: if opponent going for grand slam, block aggressively ===
        const grandSlamOpponent = this.findGrandSlamOpponent(tricksTaken);
        if (grandSlamOpponent && !isGrandSlam) {
            const winner = this.currentTrickWinner(currentTrick, leadSuit);
            // If the grand slam opponent is NOT winning this trick, dump a heart
            // so someone else takes it and breaks their sweep
            if (winner && winner.playerId !== grandSlamOpponent) {
                const hearts = validCards.filter(c => this.isHeart(c));
                if (hearts.length > 0) {
                    return this.getLowestCard(hearts);
                }
            }
            // If grand slam opponent IS winning, dump pig to give them penalty...
            // Actually they WANT scoring cards, so dump NON-scoring to avoid helping them
            // Skip pig/sheep dump priority to deny them scoring cards
        }

        // === Smart dump targeting: if current trick winner is an opponent
        //     attempting a hearts sweep, dump a heart to block them ===
        const sweepingOpponent = !grandSlamOpponent ? this.findSweepingOpponent(tricksTaken) : null;
        if (sweepingOpponent) {
            const winner = this.currentTrickWinner(currentTrick, leadSuit);
            // If the sweeping opponent is NOT winning this trick,
            // dump a heart so THEY don't get it (someone else takes it)
            if (winner && winner.playerId !== sweepingOpponent) {
                const hearts = validCards.filter(c => this.isHeart(c));
                if (hearts.length > 0) {
                    return this.getLowestCard(hearts); // cheap heart blocks sweep
                }
            }
        }

        // === SWEEP / GRAND SLAM MODE: keep scoring cards, dump everything else ===
        if (isSweeping) {
            if (isGrandSlam) {
                // Grand slam: keep ALL scoring cards (hearts, pig, sheep, club ten)
                const nonScoring = validCards.filter(c => !this.isScoringCard(c));
                if (nonScoring.length > 0) {
                    return this.getHighestCard(nonScoring);
                }
                // Only scoring cards left — dump the least valuable
                return this.getLowestCard(validCards);
            }
            // Regular sweep: keep hearts, dump everything else
            const nonHearts = validCards.filter(c => !this.isHeart(c));
            if (nonHearts.length > 0) {
                const pig = nonHearts.find(c => this.isPig(c));
                if (pig) return pig;
                return this.getHighestCard(nonHearts);
            }
            return this.getLowestCard(validCards);
        }

        // === Priority 1: Dump the pig (Q♠ = -100 on opponent!) ===
        const pig = validCards.find(c => this.isPig(c));
        if (pig) return pig;

        // === Priority 2: Dump K♠ or A♠ if pig is still out (avoid winning pig later) ===
        const pigStillOut = this.pigIsStillOut(tricksTaken, currentTrick);
        if (pigStillOut) {
            const highSpades = validCards.filter(c => c.suit === 'spades' && this.cardValue(c) > 12);
            if (highSpades.length > 0) {
                return this.getHighestCard(highSpades); // dump A♠ first, then K♠
            }
        }

        // === Priority 3: Dump highest hearts (A♥=-50, K♥=-40, etc.) ===
        const hearts = validCards.filter(c => this.isHeart(c));
        if (hearts.length > 0) {
            return this.getHighestCard(hearts);
        }

        // === Priority 4: Dump club ten if we already have penalties ===
        const clubTen = validCards.find(c => this.isClubTen(c));
        if (clubTen) {
            const myTaken = tricksTaken[botId] || [];
            const myPenalty = myTaken.reduce((sum, c) => sum + this.cardPenalty(c), 0);
            const hasSheep = myTaken.some(c => this.isSheep(c));

            if (myPenalty < -10 && !hasSheep) {
                return clubTen;
            }
        }

        // === Priority 5: Handle sheep strategically ===
        // Sheep is normally +100, but becomes -100 when the swap rule is active
        // (i.e., any player has all hearts without a grand slam).
        // Also dump sheep if an opponent is currently sweeping hearts (likely swap incoming).
        const sweeper = this.findSweepingOpponent(tricksTaken);
        const swapAlreadyActive = this.isSwapActive(tricksTaken);
        const sheepCard = validCards.find(c => this.isSheep(c));
        if (sheepCard && (sweeper || swapAlreadyActive)) {
            // Sheep would be -100 for us — dump it!
            return sheepCard;
        }

        // === Priority 6: Void a short suit — dump highest cards ===
        const suitGroups = {};
        for (const c of validCards) {
            // Skip sheep (J♦) — never dump voluntarily (it's +100 normally)
            if (this.isSheep(c)) continue;
            // Skip club ten if we want to keep it
            if (this.isClubTen(c)) continue;
            if (!suitGroups[c.suit]) suitGroups[c.suit] = [];
            suitGroups[c.suit].push(c);
        }

        // Dump from shortest non-heart suit to create voids
        const suitEntries = Object.entries(suitGroups)
            .filter(([suit]) => suit !== 'hearts')
            .sort((a, b) => a[1].length - b[1].length);

        if (suitEntries.length > 0) {
            return this.getHighestCard(suitEntries[0][1]);
        }

        // If all we have left are protected cards (sheep, club ten) and hearts
        // Dump from any remaining group
        const allGroupEntries = Object.entries(suitGroups)
            .sort((a, b) => a[1].length - b[1].length);
        if (allGroupEntries.length > 0) {
            return this.getHighestCard(allGroupEntries[0][1]);
        }

        // === Fallback: absolutely forced — play least valuable ===
        // Even sheep if it's all we have
        return this.getHighestCard(validCards);
    }

    // ─── Helper: Check if a specific card has already been played ───
    isCardPlayed(rank, suit, tricksTaken, currentTrick) {
        for (const pid of Object.keys(tricksTaken)) {
            if (tricksTaken[pid].some(c => c.suit === suit && c.rank === rank)) return true;
        }
        if (currentTrick.some(p => p.card.suit === suit && p.card.rank === rank)) return true;
        return false;
    }

    // ─── Helper: Get safe leads (non-scoring, not dangerously high) ───
    getSafeLeads(validCards, tricksTaken) {
        const safe = [];
        for (const c of validCards) {
            if (this.isScoringCard(c)) continue;
            // Don't lead K/A of spades if pig is still out (we'd win the pig)
            if (c.suit === 'spades') {
                const pigPlayed = this.isCardPlayed('Q', 'spades', tricksTaken, []);
                if (!pigPlayed && this.cardValue(c) > 12) continue;
            }
            safe.push(c);
        }
        return safe;
    }

    // ─── Helper: Lead from strongest suit ───
    leadStrongestSuit(validCards, gs) {
        const suitGroups = {};
        for (const c of validCards) {
            if (!suitGroups[c.suit]) suitGroups[c.suit] = [];
            suitGroups[c.suit].push(c);
        }

        let bestSuit = null;
        let bestLen = 0;
        for (const [suit, cards] of Object.entries(suitGroups)) {
            if (cards.length > bestLen) {
                bestLen = cards.length;
                bestSuit = suit;
            }
        }

        if (bestSuit) {
            return this.getHighestCard(suitGroups[bestSuit]);
        }
        return this.getHighestCard(validCards);
    }

    // ─── Helper: Pick the least damaging scoring card to lead ───
    getLeastDamagingCard(cards) {
        // Prefer: club ten (+50 standalone), sheep (+100), low hearts, pig last
        const clubTen = cards.find(c => this.isClubTen(c));
        if (clubTen) return clubTen;

        const sheep = cards.find(c => this.isSheep(c));
        if (sheep) return sheep;

        const hearts = cards.filter(c => this.isHeart(c));
        if (hearts.length > 0) {
            return this.getLowestCard(hearts);
        }

        const pig = cards.find(c => this.isPig(c));
        if (pig) return pig;

        return cards[0];
    }
}

function createBot(id) {
    return new Bot(id);
}

module.exports = { Bot, createBot, BOT_NAMES, BOT_AVATARS };
