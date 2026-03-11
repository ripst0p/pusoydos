// --- CONSTANTS & HIERARCHY ---
// Ranks: 3 is the lowest, 2 is the highest. Index = Power level.
const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];

// Suits: Clubs (lowest) to Diamonds (highest)
const SUITS = ['♣', '♠', '♥', '♦'];

// --- HAND EVALUATION LOGIC ---
function getHandValue(cards) {
    if (!cards || cards.length === 0) return null;
    
    // Sort cards by Rank (Primary) then Suit (Secondary)
    let c = [...cards].sort((a, b) => a.r - b.r || a.s - b.s);
    let len = c.length;

    // 1. SINGLES
    if (len === 1) {
        return { type: 1, val: c[0].r, suit: c[0].s, name: "Single" };
    }
    
    // 2. PAIRS
    if (len === 2) {
        if (c[0].r === c[1].r) {
            // The value of the pair is determined by its highest suit
            return { type: 2, val: c[0].r, suit: c[1].s, name: "Pair" };
        }
        return null;
    }
    
    // 3. THREE OF A KIND
    if (len === 3) {
        if (c[0].r === c[1].r && c[1].r === c[2].r) {
            return { type: 3, val: c[0].r, suit: c[2].s, name: "Three of a Kind" };
        }
        return null;
    }
    
    // 4. FIVE-CARD HANDS
    if (len === 5) {
        let isFlush = c.every(card => card.s === c[0].s);
        
        // STRICT STRAIGHT CHECK: No wraparounds, AND '2' cannot be in a straight.
        let isStraight = true;
        
        // A '2' has an internal rank index of 12. If it's in the hand, it's not a straight.
        if (c.some(card => card.r === 12)) {
            isStraight = false;
        } else {
            for (let i = 1; i < 5; i++) {
                if (c[i].r !== c[i-1].r + 1) {
                    isStraight = false;
                    break;
                }
            }
        }

        // Count frequencies for Full House / Four of a Kind
        let counts = {};
        c.forEach(card => counts[card.r] = (counts[card.r] || 0) + 1);
        let freqs = Object.values(counts).sort((a,b) => b - a); // Sort highest frequency first

        let isFourOfAKind = (freqs[0] === 4);
        let isFullHouse = (freqs[0] === 3 && freqs[1] === 2);

        let highCard = c[4]; 

        // 5-Card Combinations ranked from Highest to Lowest
        if (isStraight && isFlush) return { type: 8, val: highCard.r, suit: highCard.s, name: "Straight Flush" };
        
        if (isFourOfAKind) {
            let quadRank = parseInt(Object.keys(counts).find(k => counts[k] === 4));
            return { type: 7, val: quadRank, suit: 4, name: "Four of a Kind" }; // Suit rarely matters for quads in standard play
        }
        
        if (isFullHouse) {
            let tripRank = parseInt(Object.keys(counts).find(k => counts[k] === 3));
            return { type: 6, val: tripRank, suit: 4, name: "Full House" };
        }
        
        if (isFlush) return { type: 5, val: highCard.r, suit: highCard.s, name: "Flush" };
        
        if (isStraight) return { type: 4, val: highCard.r, suit: highCard.s, name: "Straight" };
    }
    
    return null; // Invalid combination
}

// --- MOVE VALIDATION LOGIC ---
function isValidMove(currentVal, currentCards, lastHand, lastPlayerIdx, isMyTurn) {
    if (!currentVal) return false;
    
    // SCENARIO 1: Free table (You won the last round or it's the very first play)
    if (!lastHand || lastPlayerIdx === -1) {
        return [1, 2, 3, 5].includes(currentCards.length);
    }

    // SCENARIO 2: Match length constraint
    // You cannot play 2 cards on a 1 card.
    // Exception: 5-card hands can beat other 5-card hands.
    if (currentCards.length !== lastHand.length && !(currentCards.length === 5 && lastHand.length === 5)) {
        return false;
    }

    // SCENARIO 3: Singles, Pairs, Triples
    if (currentCards.length < 5) {
        if (currentVal.val > lastHand.val) return true;
        if (currentVal.val === lastHand.val) return currentVal.suit > lastHand.suit; // Tie-breaker
        return false;
    } 
    
    // SCENARIO 4: Five-Card Combinations
    else {
        // Higher tier hand beats lower tier (e.g., Flush beats Straight)
        if (currentVal.type > lastHand.type) return true;
        if (currentVal.type < lastHand.type) return false;

        // Same tier, higher value beats lower value
        if (currentVal.val > lastHand.val) return true;
        if (currentVal.val === lastHand.val) return currentVal.suit > lastHand.suit; // Tie-breaker
        return false;
    }
}

// --- AI / BOT HELPER: GENERATE MOVES ---
function getCombinations(arr, k) {
    let i, j, combs, head, tailcombs;
    if (k > arr.length || k <= 0) return [];
    if (k === arr.length) return [arr];
    if (k === 1) {
        combs = [];
        for (i = 0; i < arr.length; i++) combs.push([arr[i]]);
        return combs;
    }
    combs = [];
    for (i = 0; i < arr.length - k + 1; i++) {
        head = arr.slice(i, i + 1);
        tailcombs = getCombinations(arr.slice(i + 1), k - 1);
        for (j = 0; j < tailcombs.length; j++) {
            combs.push(head.concat(tailcombs[j]));
        }
    }
    return combs;
}

function getAllValidMoves(hand, lastHand, lastPlayerIdx) {
    let moves = [];
    let counts = [1, 2, 3, 5];
    
    counts.forEach(k => {
        if (hand.length >= k) {
            // Only generate matching lengths unless we have table control
            if (lastHand && lastPlayerIdx !== -1 && k !== lastHand.length) {
                if (!(k === 5 && lastHand.length === 5)) return; // Only 5s can challenge 5s
            }
            
            let combs = getCombinations(hand, k);
            combs.forEach(cards => {
                let val = getHandValue(cards);
                if (val && isValidMove(val, cards, lastHand, lastPlayerIdx, false)) {
                    moves.push({ cards: cards, val: val });
                }
            });
        }
    });
    
    return moves;
}

// Node.js export wrapper for server-side validation if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getHandValue, isValidMove, getAllValidMoves, RANKS, SUITS };
}
