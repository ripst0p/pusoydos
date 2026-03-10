// --- CORE CONSTANTS ---
const SUITS = ['♣', '♠', '♥', '♦']; // Clubs lowest, Diamonds highest
const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2']; 
// Indices: 3=0, 4=1, ..., A=11, 2=12

// The strict list of legal straights in Pusoy Dos. 
// "val" determines the strength of the straight, "suitIdx" tracks which card decides tie-breakers.
const STRAIGHT_PATTERNS = {
    "0,1,2,3,4":   { val: 4,  suitIdx: 4 }, // 3-4-5-6-7 (Highest is 7)
    "1,2,3,4,5":   { val: 5,  suitIdx: 4 }, // 4-5-6-7-8 (Highest is 8)
    "2,3,4,5,6":   { val: 6,  suitIdx: 4 }, // 5-6-7-8-9 (Highest is 9)
    "3,4,5,6,7":   { val: 7,  suitIdx: 4 }, // 6-7-8-9-10 (Highest is 10)
    "4,5,6,7,8":   { val: 8,  suitIdx: 4 }, // 7-8-9-10-J (Highest is J)
    "5,6,7,8,9":   { val: 9,  suitIdx: 4 }, // 8-9-10-J-Q (Highest is Q)
    "6,7,8,9,10":  { val: 10, suitIdx: 4 }, // 9-10-J-Q-K (Highest is K)
    "7,8,9,10,11": { val: 11, suitIdx: 4 }, // 10-J-Q-K-A (Highest is A)
    "0,1,2,11,12": { val: 2,  suitIdx: 2 }, // A-2-3-4-5 (Highest card in sequence is 5)
    "0,1,2,3,12":  { val: 3,  suitIdx: 3 }  // 2-3-4-5-6 (Highest card in sequence is 6)
};

// --- HAND IDENTIFICATION ---
function getHandValue(cards) {
    if (!cards || cards.length === 0) return null;
    
    // Always sort cards by rank, then suit before analyzing
    let c = [...cards].sort((a,b) => a.r - b.r || a.s - b.s);
    const len = c.length;
    
    // 1-Card, 2-Card, 3-Card Combinations
    if (len === 1) return { type: 1, val: c[0].r, suit: c[0].s, name: "Single" };
    if (len === 2 && c[0].r === c[1].r) return { type: 2, val: c[0].r, suit: c[1].s, name: "Pair" };
    if (len === 3 && c[0].r === c[2].r) return { type: 3, val: c[0].r, suit: c[2].s, name: "Three of a Kind" };
    
    // 5-Card Combinations
    if (len === 5) {
        const isFlush = c.every(card => card.s === c[0].s);
        
        // Check strict straight patterns
        const ranksKey = c.map(card => card.r).join(',');
        const straightMatch = STRAIGHT_PATTERNS[ranksKey];
        const isStraight = !!straightMatch;

        // Tally up duplicates for Full Houses and Quads
        const counts = {};
        c.forEach(card => counts[card.r] = (counts[card.r] || 0) + 1);
        const countVals = Object.values(counts);

        // Evaluate hierarchy (Highest to Lowest)
        if (isStraight && isFlush) return { type: 5, rank: 5, val: straightMatch.val, suit: c[straightMatch.suitIdx].s, name: "Straight Flush" };
        if (countVals.includes(4)) return { type: 5, rank: 4, val: parseInt(Object.keys(counts).find(k=>counts[k]===4)), suit: 0, name: "Four of a Kind" };
        if (countVals.includes(3) && countVals.includes(2)) return { type: 5, rank: 3, val: parseInt(Object.keys(counts).find(k=>counts[k]===3)), suit: 0, name: "Full House" };
        if (isFlush) return { type: 5, rank: 2, val: c[4].r, suit: c[0].s, name: "Flush" }; 
        if (isStraight) return { type: 5, rank: 1, val: straightMatch.val, suit: c[straightMatch.suitIdx].s, name: "Straight" };
    }
    return null; 
}

// --- MOVE VALIDATION ---
function isValidMove(newHand, cards, lastHand, lastPlayerIdx, isBot = false) {
    if(!newHand) return false; // Hand isn't a recognized poker/pusoy combo
    
    // 1. Must play 3 of Clubs on very first turn
    if(lastPlayerIdx === -1) {
        if(!cards.some(c => c.r === 0 && c.s === 0)) {
            if(!isBot) alert("You must play the 3 of Clubs (♣) to start the game!");
            return false;
        }
        return true;
    }
    
    // 2. Open table (Player has control)
    if(!lastHand) return true;
    
    // 3. Must match combination type length
    if(newHand.type !== lastHand.type) {
        if(!isBot) alert(`You must play a ${lastHand.name}!`);
        return false;
    }
    
    // 4. Checking strength of combination
    if(newHand.type < 5) {
        // Singles, Pairs, Triples
        if(newHand.val > lastHand.val) return true;
        if(newHand.val === lastHand.val && newHand.suit > lastHand.suit) return true;
    } else if(newHand.type === 5) {
        // 5-Card Hands
        if(newHand.rank > lastHand.rank) return true; // e.g. Full House beats a Flush
        
        if(newHand.rank === lastHand.rank) { // Same tier 5-card hands fighting
            if(newHand.rank === 2) { 
                // Flushes: Suit breaks ties first, then highest card value
                if(newHand.suit > lastHand.suit) return true;
                if(newHand.suit === lastHand.suit && newHand.val > lastHand.val) return true;
            } else {
                // Straights, Full Houses, Quads: Value breaks ties, then suit
                if(newHand.val > lastHand.val) return true;
                if(newHand.val === lastHand.val && newHand.suit > lastHand.suit) return true;
            }
        }
    }
    
    if(!isBot) alert("Your combination is not strong enough to beat the table!");
    return false;
}

// --- COMBINATORICS (AI Brain) ---
function getCombinations(arr, k) {
    if (k > arr.length || k <= 0) return [];
    if (k === arr.length) return [arr];
    if (k === 1) return arr.map(a => [a]);
    let combs = [];
    for (let i = 0; i < arr.length - k + 1; i++) {
        let head = arr.slice(i, i + 1);
        let tailcombs = getCombinations(arr.slice(i + 1), k - 1);
        for (let j = 0; j < tailcombs.length; j++) combs.push(head.concat(tailcombs[j]));
    }
    return combs;
}

function getAllValidMoves(hand, lastHand, lastPlayerIdx) {
    let validMoves = [];
    let targets = lastHand ? [lastHand.type] : [1, 2, 3, 5];
    
    for(let t of targets) {
        if (t === 1) hand.forEach(c => { let v = getHandValue([c]); if(isValidMove(v, [c], lastHand, lastPlayerIdx, true)) validMoves.push({cards: [c], val: v}); });
        if (t === 2) getCombinations(hand, 2).forEach(p => { let v = getHandValue(p); if(v && isValidMove(v, p, lastHand, lastPlayerIdx, true)) validMoves.push({cards: p, val: v}); });
        if (t === 3) getCombinations(hand, 3).forEach(tr => { let v = getHandValue(tr); if(v && isValidMove(v, tr, lastHand, lastPlayerIdx, true)) validMoves.push({cards: tr, val: v}); });
        if (t === 5) getCombinations(hand, 5).forEach(f => { let v = getHandValue(f); if(v && isValidMove(v, f, lastHand, lastPlayerIdx, true)) validMoves.push({cards: f, val: v}); });
    } 
    return validMoves;
}