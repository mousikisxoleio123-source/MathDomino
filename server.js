const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

// Σερβίρισμα των στατικών αρχείων (html, φωτογραφίες)
app.use(express.static(path.join(__dirname, 'public')));

let gameState = {
    players: {}, // Θα κρατάει τα socket.id των 2 παικτών
    numberPool: [],
    gridState: {},
    validatedSlots: [],
    currentPlayer: 1,
    gameStarted: false
};

// Αρχικοποίηση κασετίνας στον server για να είναι κοινή
function initPool() {
    let pool = [];
    for (let n = 0; n <= 9; n++) {
        for (let i = 0; i < 6; i++) { pool.push(n.toString()); }
    }
    return pool;
}

function drawFromPool(amount) {
    let drawn = [];
    for(let i=0; i<amount; i++) {
        if (gameState.numberPool.length === 0) break;
        const randomIndex = Math.floor(Math.random() * gameState.numberPool.length);
        drawn.push(gameState.numberPool.splice(randomIndex, 1)[0]);
    }
    return drawn;
}

io.on('connection', (socket) => {
    console.log(`Χρήστης συνδέθηκε: ${socket.id}`);

    // Ανάθεση παίκτη (1 ή 2)
    let playerNumber = null;
    if (!gameState.players.p1) {
        gameState.players.p1 = socket.id;
        playerNumber = 1;
    } else if (!gameState.players.p2) {
        gameState.players.p2 = socket.id;
        playerNumber = 2;
    }

    // Ενημέρωση του παίκτη για το νούμερό του
    socket.emit('playerAssignment', { playerNumber });

    // Μόλις συνδεθούν και οι δύο, ξεκινάει το παιχνίδι
    if (gameState.players.p1 && gameState.players.p2 && !gameState.gameStarted) {
        gameState.numberPool = initPool();
        gameState.gridState = {};
        gameState.validatedSlots = [];
        gameState.currentPlayer = 1;
        gameState.gameStarted = true;

        // Μοίρασμα αρχικών πλακιδίων
        const p1Tiles = drawFromPool(12);
        const p2Tiles = drawFromPool(12);
        const startingTile = drawFromPool(1)[0];

        // Τοποθέτηση πρώτου πλακιδίου στο κέντρο (π.χ. slot_r3_c5 ανάλογα το πλέγμα)
        // Για ασφάλεια, ας το βάλουμε στο slot_r0_c0 όπως το είχες προσωρινά
        gameState.gridState['slot_r0_c0'] = startingTile;
        gameState.validatedSlots.push('slot_r0_c0');

        io.emit('startGame', {
            p1Tiles,
            p2Tiles,
            startingTile,
            poolCount: gameState.numberPool.length
        });
    }

    // Λήψη κίνησης (Όταν ένας παίκτης κάνει επιτυχημένο έλεγχο)
    socket.on('submitMove', (data) => {
        // data = { temporaryPlacements, updatedGridState }
        
        // Ενημέρωση της κατάστασης στον server
        data.temporaryPlacements.forEach(id => {
            gameState.validatedSlots.push(id);
            gameState.gridState[id] = data.updatedGridState[id];
        });

        // Εκπομπή της κίνησης στον άλλον παίκτη για να ενημερωθεί η οθόνη του live!
        socket.broadcast.emit('updateBoard', {
            validatedSlots: gameState.validatedSlots,
            gridState: gameState.gridState
        });
    });

    // Αλλαγή γύρου (Όταν πατάει OK)
    socket.on('endTurn', (data) => {
        // Αν ο παίκτης δεν έπαιξε, του στέλνουμε ένα πλακίδιο
        let drawnTile = null;
        if (!data.hasValidated) {
            const drawn = drawFromPool(1);
            if (drawn.length > 0) {
                drawnTile = drawn[0];
                socket.emit('drawTile', { tile: drawnTile });
            }
        }

        gameState.currentPlayer = gameState.currentPlayer === 1 ? 2 : 1;
        
        io.emit('newTurn', {
            currentPlayer: gameState.currentPlayer,
            poolCount: gameState.numberPool.length
        });
    });

    socket.on('disconnect', () => {
        console.log(`Χρήστης αποσυνδέθηκε: ${socket.id}`);
        if (gameState.players.p1 === socket.id) delete gameState.players.p1;
        if (gameState.players.p2 === socket.id) delete gameState.players.p2;
        gameState.gameStarted = false;
        io.emit('playerDisconnected');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server τρέχει στη θύρα ${PORT}`);
});
