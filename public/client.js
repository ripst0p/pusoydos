// --- SYNTHETIC AUDIO ENGINE ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSound(type) {
    const muteToggle = document.getElementById('mute-toggle');
    if(muteToggle && !muteToggle.checked) return; 
    if(audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime;
    if(type === 'snap') { osc.type = 'triangle'; osc.frequency.setValueAtTime(800, now); osc.frequency.exponentialRampToValueAtTime(100, now + 0.1); gain.gain.setValueAtTime(0.5, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1); osc.start(now); osc.stop(now + 0.1); } 
    else if(type === 'error') { osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, now); gain.gain.setValueAtTime(0.3, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3); osc.start(now); osc.stop(now + 0.3); } 
    else if(type === 'tick') { osc.type = 'square'; osc.frequency.setValueAtTime(1000, now); gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05); osc.start(now); osc.stop(now + 0.05); } 
    else if(type === 'pass') { osc.type = 'sine'; osc.frequency.setValueAtTime(300, now); osc.frequency.linearRampToValueAtTime(200, now + 0.2); gain.gain.setValueAtTime(0.3, now); gain.gain.linearRampToValueAtTime(0.01, now + 0.2); osc.start(now); osc.stop(now + 0.2); }
}

// --- INIT & GLOBALS ---
let socket;
try { socket = io(); } catch(e) { console.warn("Running in Offline Mode"); }

let isOnline = false, isHost = true, roomId = null;
let myName = "Player1", myColor = "#ff3366", mySeatIndex = 0; 

let gameState = { players: [], turn: 0, lastHand: null, lastPlayerIdx: -1, passCount: 0, tableCards: [], round: 1, maxRounds: 3, scores: [0,0,0,0], isGameOver: false };
let selectedIndices = [];
let focusedIndex = -1; 
let currentTableState = ""; 

let turnTimerInterval;
let timeLeft = 30;

// --- UI HELPERS ---
function showScreen(id) { document.querySelectorAll('.screen').forEach(s => s.classList.remove('active')); document.getElementById(id).classList.add('active'); }
function setColor(el, color) { document.querySelectorAll('.c-dot').forEach(d => d.classList.remove('selected')); el.classList.add('selected'); myColor = color; }
function showMsg(text) { const el = document.getElementById('msg'); el.innerText = text; setTimeout(() => { if(el.innerText === text) el.innerText = ""; }, 2500); }
function clearSelection(e) { 
    if (e && e.target.id !== 'game-board') return; 
    focusedIndex = -1; 
    if (selectedIndices.length > 0) { selectedIndices = []; renderClientState(); } 
}

// --- KEYBOARD SHORTCUTS ---
window.addEventListener('keydown', (e) => {
    if(document.activeElement.tagName === "INPUT") return;
    if (gameState.turn !== mySeatIndex || gameState.isGameOver) return;
    const handSize = gameState.players[mySeatIndex].hand.length;

    if (e.key === 'ArrowRight') {
        if (focusedIndex === -1) focusedIndex = 0; 
        else focusedIndex = (focusedIndex + 1) % handSize;
        renderClientState();
    } else if (e.key === 'ArrowLeft') {
        if (focusedIndex === -1) focusedIndex = handSize - 1; 
        else focusedIndex = (focusedIndex - 1 + handSize) % handSize;
        renderClientState();
    } else if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        if (focusedIndex === -1) return; 
        if(selectedIndices.includes(focusedIndex)) selectedIndices = selectedIndices.filter(x => x !== focusedIndex);
        else selectedIndices.push(focusedIndex);
        playSound('snap');
        renderClientState();
    } else if (e.key === 'Enter') {
        playSelected();
    } else if (e.key.toLowerCase() === 'p') {
        passTurn();
    } else if (e.key === 'Escape') {
        selectedIndices = [];
        focusedIndex = -1; 
        renderClientState();
    }
});

// --- MENU & LEAVE LOGIC ---
function setMode(mode) { myName = document.getElementById('playerName').value || "Player"; if(mode === 'offline') { isOnline = false; isHost = true; setupOfflineGame(); } }
function hostRoom() { myName = document.getElementById('playerName').value || "Host"; isOnline = true; isHost = true; roomId = Math.random().toString(36).substring(2, 7).toUpperCase(); if(socket) socket.emit('createRoom', { roomId }); document.getElementById('chat-ui').style.display = 'flex'; }
function joinRoom() { myName = document.getElementById('playerName').value || "Player"; let code = document.getElementById('roomCode').value.toUpperCase(); if(!code) return alert("Enter a room code!"); isOnline = true; isHost = false; roomId = code; if(socket) socket.emit('joinRoom', { roomId, playerName: myName, playerColor: myColor }); document.getElementById('chat-ui').style.display = 'flex'; }
function leaveGame() { if(confirm("Are you sure you want to leave the VIP Table?")) { if(isOnline && socket) socket.emit('leaveRoom'); location.reload(); } }

// --- SOCKET LISTENERS ---
if(socket) {
    socket.on('roomCreated', (id) => { showScreen('lobby-screen'); document.getElementById('display-room-code').innerText = id; });
    socket.on('requestJoin', (newPlayer) => {
        if (!isHost) return;
        let botIndex = gameState.players.findIndex(p => p.isBot);
        if (botIndex !== -1) {
            gameState.players[botIndex] = { ...gameState.players[botIndex], id: newPlayer.socketId, name: newPlayer.name, color: newPlayer.color, isBot: false };
            socket.emit('joinAccepted', { targetSocketId: newPlayer.socketId, roomId, gameState });
            showMsg(`${newPlayer.name} Sat Down`); renderClientState(); broadcastState();
        } else { socket.emit('joinRejected', { targetSocketId: newPlayer.socketId, reason: "Table Full" }); }
    });
    socket.on('gameJoined', (data) => { roomId = data.roomId; gameState = data.gameState; isHost = false; mySeatIndex = gameState.players.findIndex(p => p.id === socket.id); showScreen('game-board'); renderClientState(); startTimer(); });
    socket.on('errorMsg', (msg) => { alert(msg); playSound('error'); });
    socket.on('gameStateUpdated', (newState) => { if(!isHost){ gameState = newState; mySeatIndex = gameState.players.findIndex(p => p.id === socket.id); renderClientState(); startTimer(); } });
    socket.on('processClientMove', (data) => {
        if(!isHost || gameState.turn !== data.seatIndex) return;
        if(data.action === 'play') { let val = getHandValue(data.cards); if(isValidMove(val, data.cards, gameState.lastHand, gameState.lastPlayerIdx, true)) { executeMove(data.cards, val); } } 
        else if (data.action === 'pass') passGameTurn();
    });
    socket.on('receiveChat', ({ name, msg, color }) => { const box = document.getElementById('chat-msgs'); box.innerHTML += `<div><strong style="color:${color}">${name}:</strong> ${msg}</div>`; box.scrollTop = box.scrollHeight; });
    socket.on('hostLeft', () => { alert("The Host left the game. Table closed."); location.reload(); });
    socket.on('playerLeft', (socketId) => {
        if(!isHost) return;
        let pIndex = gameState.players.findIndex(p => p.id === socketId);
        if(pIndex !== -1) {
            gameState.players[pIndex].isBot = true; gameState.players[pIndex].id = `bot${pIndex}`; gameState.players[pIndex].name = `Bot ${pIndex}`; gameState.players[pIndex].color = '#555';
            showMsg(`Player Left. Bot Took Over.`); broadcastState(); renderClientState(); if(gameState.turn === pIndex) processTurn();
        }
    });
}
function sendChat() { let input = document.getElementById('chat-text'); if(input.value.trim() && socket) { socket.emit('sendChat', { roomId, name: myName, msg: input.value, color: myColor }); input.value = ''; } }

// --- GAME INITIALIZATION ---
function setupOfflineGame() { gameState.maxRounds = 3; gameState.players = [ { id: 'local', name: myName, color: myColor, isBot: false, hand: [] }, { id: 'b1', name: 'Bot 1', color: '#00e5ff', isBot: true, hand: [] }, { id: 'b2', name: 'Bot 2', color: '#ffea00', isBot: true, hand: [] }, { id: 'b3', name: 'Bot 3', color: '#00e676', isBot: true, hand: [] } ]; mySeatIndex = 0; startNewRound(); }
function startMultiplayerGame() { if(!isHost) return; gameState.maxRounds = parseInt(document.getElementById('rounds-select').value); gameState.players = [ { id: socket.id, name: myName, color: myColor, isBot: false, hand: [] }, { id: 'b1', name: 'Bot 1', color: '#777', isBot: true, hand: [] }, { id: 'b2', name: 'Bot 2', color: '#777', isBot: true, hand: [] }, { id: 'b3', name: 'Bot 3', color: '#777', isBot: true, hand: [] } ]; mySeatIndex = 0; startNewRound(); }

function startNewRound() {
    showScreen('game-board'); document.getElementById('scoreboard-screen').style.display = 'none'; gameState.isGameOver = false;
    let deck = [];
    for(let r=0; r<13; r++) for(let s=0; s<4; s++) deck.push({r, s, name: RANKS[r], suit: SUITS[s]}); deck.sort(() => Math.random() - 0.5);
    gameState.players.forEach((p, i) => p.hand = deck.slice(i*13, (i+1)*13).sort((a,b) => a.r - b.r || a.s - b.s));
    gameState.turn = gameState.players.findIndex(p => p.hand.some(c => c.r === 0 && c.s === 0));
    
    gameState.lastHand = null; gameState.lastPlayerIdx = -1; gameState.passCount = 0; gameState.tableCards = []; selectedIndices = []; focusedIndex = -1; currentTableState = "";
    
    renderClientState(); if(isOnline && isHost) broadcastState(); startTimer(); processTurn();
}
function broadcastState() { if(socket) socket.emit('syncGameState', { roomId, state: gameState }); }

// --- TIMER LOGIC ---
function startTimer() { clearInterval(turnTimerInterval); timeLeft = 30; const bar = document.getElementById('timer-bar'); bar.style.width = '100%'; bar.classList.remove('warning'); turnTimerInterval = setInterval(() => { if(gameState.isGameOver) return clearInterval(turnTimerInterval); timeLeft--; const pct = (timeLeft / 30) * 100; bar.style.width = `${pct}%`; if (timeLeft <= 5 && timeLeft > 0 && gameState.turn === mySeatIndex) { bar.classList.add('warning'); playSound('tick'); } else if (timeLeft <= 0) { clearInterval(turnTimerInterval); if(gameState.turn === mySeatIndex) handleTimeout(); } }, 1000); }
function handleTimeout() { showMsg("Time's Up!"); playSound('error'); if(gameState.lastPlayerIdx === -1 || !gameState.lastHand || gameState.lastPlayerIdx === mySeatIndex) { let moves = getAllValidMoves(gameState.players[mySeatIndex].hand, gameState.lastHand, gameState.lastPlayerIdx); if(gameState.lastPlayerIdx === -1) moves = moves.filter(m => m.cards.some(c => c.r===0&&c.s===0)); moves.sort((a,b) => a.val.type - b.val.type || a.val.val - b.val.val); if(moves.length > 0) { selectedIndices = []; moves[0].cards.forEach(c => selectedIndices.push(gameState.players[mySeatIndex].hand.findIndex(h => h.r===c.r && h.s===c.s))); playSelected(); } } else { passTurn(); } }

// --- RENDERING & UI ACTIONS ---
function renderClientState() {
    const ph = document.getElementById('player-hand'); ph.innerHTML = '';
    
    gameState.players[mySeatIndex].hand.forEach((c, i) => {
        const div = document.createElement('div');
        let classes = `card ${c.s === 2 || c.s === 3 ? 'red' : ''}`;
        if(selectedIndices.includes(i)) classes += ' selected';
        if(gameState.turn === mySeatIndex && focusedIndex !== -1 && focusedIndex === i) classes += ' keyboard-focus';
        div.className = classes;
        
        div.innerHTML = `<span>${c.name}</span><span>${c.suit}</span>`;
        div.onclick = () => {
            if(gameState.turn !== mySeatIndex) return;
            focusedIndex = -1; 
            playSound('snap');
            selectedIndices.includes(i) ? selectedIndices = selectedIndices.filter(x => x!==i) : selectedIndices.push(i);
            renderClientState();
        };
        ph.appendChild(div);
    });

    const newTableState = gameState.tableCards.map(c => c.r + '-' + c.s).join(',');
    if (currentTableState !== newTableState) {
        document.getElementById('table-cards').innerHTML = gameState.tableCards.map((c, idx) => `<div class="card on-table ${c.s === 2 || c.s === 3 ? 'red' : ''}" style="--rot:${(idx*8)-15}deg; z-index:${idx}"><span>${c.name}</span><span>${c.suit}</span></div>`).join('');
        currentTableState = newTableState;
    }

    document.getElementById('hand-type').innerText = gameState.lastHand ? gameState.lastHand.name : "";

    const pos = ['left', 'top', 'right'];
    for(let i=1; i<=3; i++) {
        let tIdx = (mySeatIndex + i) % 4, p = gameState.players[tIdx];
        document.getElementById(`name-${pos[i-1]}`).innerText = p.name;
        document.getElementById(`cards-${pos[i-1]}`).innerText = p.hand.length;
        document.getElementById(`c-${pos[i-1]}`).style.background = p.color;
        document.getElementById(`tag-${pos[i-1]}`).classList.toggle('active-turn', gameState.turn === tIdx);
    }

    document.getElementById('game-round-info').innerText = `Round ${gameState.round}/${gameState.maxRounds}`;
    
    // --- THE FIX: Display the Room Code ---
    const roomCodeEl = document.getElementById('in-game-room-code');
    if (roomCodeEl) {
        roomCodeEl.innerText = isOnline ? `ROOM: ${roomId}` : `OFFLINE`;
    }

    const isMyTurn = (gameState.turn === mySeatIndex);
    
    let canPlay = false;
    if (isMyTurn && selectedIndices.length > 0) {
        let selectedCards = selectedIndices.map(i => gameState.players[mySeatIndex].hand[i]);
        let val = getHandValue(selectedCards);
        if (val && isValidMove(val, selectedCards, gameState.lastHand, gameState.lastPlayerIdx, true)) {
            canPlay = true;
        }
    }
    document.getElementById('btn-play').disabled = !canPlay;
    document.getElementById('btn-pass').disabled = !isMyTurn;
}

// --- CORE LOGIC (Moves & AI) ---
function processTurn() { if(gameState.isGameOver) return; if(isHost) { let p = gameState.players[gameState.turn]; if(p.isBot) { setTimeout(() => { let moves = getAllValidMoves(p.hand, gameState.lastHand, gameState.lastPlayerIdx); if(moves.length === 0) { passGameTurn(); return; } if(gameState.lastPlayerIdx === -1) { moves = moves.filter(m => m.cards.some(c => c.r===0&&c.s===0)); moves.sort((a,b) => b.val.type - a.val.type); } else if(!gameState.lastHand) { moves.sort((a,b) => b.val.type - a.val.type || a.val.val - b.val.val); } else { const counts = {}; p.hand.forEach(c => counts[c.r] = (counts[c.r]||0)+1); moves.sort((a,b) => a.val.val - b.val.val); let safeMove = moves.find(m => !m.cards.some(c => counts[c.r] > m.cards.length)); if(safeMove) moves[0] = safeMove; } executeMove(moves[0].cards, moves[0].val); }, 1200); } } }

function playSelected() { let cards = selectedIndices.map(i => gameState.players[mySeatIndex].hand[i]); let val = getHandValue(cards); if(!val || !isValidMove(val, cards, gameState.lastHand, gameState.lastPlayerIdx, false)) { playSound('error'); return; } playSound('snap'); if(isHost) { executeMove(cards, val); } else { socket.emit('playerMove', { roomId, moveData: { action: 'play', cards, seatIndex: mySeatIndex }}); selectedIndices = []; focusedIndex = -1; renderClientState(); } }
function passTurn() { if(gameState.lastPlayerIdx === -1) { playSound('error'); return alert("Must start with 3♣!"); } if(!gameState.lastHand || gameState.lastPlayerIdx === gameState.turn) { playSound('error'); return alert("You have control of the table!"); } if(isHost) { passGameTurn(); } else { socket.emit('playerMove', { roomId, moveData: { action: 'pass', seatIndex: mySeatIndex }}); selectedIndices = []; focusedIndex = -1; renderClientState(); } }
function executeMove(cards, handObj) { gameState.tableCards = cards; gameState.players[gameState.turn].hand = gameState.players[gameState.turn].hand.filter(h => !cards.find(c => c.r===h.r && c.s===h.s)); gameState.lastHand = handObj; gameState.lastPlayerIdx = gameState.turn; gameState.passCount = 0; if(gameState.players[gameState.turn].hand.length === 0) return handleRoundEnd(gameState.turn); nextTurn(); }
function passGameTurn() { gameState.passCount++; playSound('pass'); showMsg(`${gameState.players[gameState.turn].name} Passed`); if(gameState.passCount >= 3) { gameState.lastHand = null; gameState.tableCards = []; } nextTurn(); }
function nextTurn() { gameState.turn = (gameState.turn + 1) % 4; selectedIndices = []; focusedIndex = -1; if(isOnline && isHost) broadcastState(); renderClientState(); startTimer(); processTurn(); }
function handleRoundEnd(winnerIdx) { gameState.isGameOver = true; gameState.scores[winnerIdx]++; clearInterval(turnTimerInterval); if(isOnline && isHost) broadcastState(); setTimeout(() => { document.getElementById('scoreboard-screen').style.display = 'flex'; document.getElementById('round-title').innerText = `ROUND ${gameState.round} OVER!`; document.getElementById('score-list').innerHTML = gameState.players.map((p, i) => `<div style="color:${p.color}; font-weight:bold; margin: 10px 0;">${p.name}: ${gameState.scores[i]} Wins ${i===winnerIdx?'🏆':''}</div>`).join(''); if(isHost) { document.getElementById('next-round-btn').style.display = 'block'; if(gameState.round >= gameState.maxRounds) document.getElementById('next-round-btn').innerText = "END MATCH"; } else { document.getElementById('waiting-host-msg').style.display = 'block'; } }, 1500); }
function nextRound() { if(gameState.round >= gameState.maxRounds) { alert("Match Finished!"); location.reload(); return; } gameState.round++; startNewRound(); }