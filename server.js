const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

// Σερβίρισμα των στατικών αρχείων από το φάκελο public
app.use(express.static(path.join(__dirname, 'public')));

let rooms = {}; // Εδώ θα αποθηκεύεται η κατάσταση του παιχνιδιού

io.on('connection', (socket) => {
    console.log(`Χρήστης συνδέθηκε: ${socket.id}`);

    // Όταν ένας παίκτης ζητάει να μπει σε παιχνίδι
    socket.on('joinGame', (roomId) => {
        if (!rooms[roomId]) {
            // Δημιουργία δωματίου αν δεν υπάρχει
            rooms[roomId] = {
                players: [],
                gridState: {},
                validatedSlots: [],
                currentPlayer: 1
            };
        }

        const room = rooms[roomId];

        if (room.players.length < 2) {
            const playerNum = room.players.length + 1;
            room.players.push({ id: socket.id, number: playerNum });
            socket.join(roomId);
            
            // Ενημέρωση του παίκτη για το νούμερό του και την τρέχουσα κατάσταση
            socket.emit('playerAssigned', { playerNum, gridState: room.gridState, validatedSlots: room.validatedSlots });
            console.log(`Ο Παίκτης ${playerNum} μπήκε στο δωμάτιο: ${roomId}`);

            // Αν μαζευτούν 2, ξεκινάει το παιχνίδι
            if (room.players.length === 2) {
                io.to(roomId).emit('gameStart', { currentPlayer: room.currentPlayer });
            }
        } else {
            socket.emit('roomFull');
        }
    });

    // Λήψη κίνησης και προώθηση στον άλλον παίκτη
    socket.on('playerMove', ({ roomId, gridState, validatedSlots, nextPlayer }) => {
        if (rooms[roomId]) {
            rooms[roomId].gridState = gridState;
            rooms[roomId].validatedSlots = validatedSlots;
            rooms[roomId].currentPlayer = nextPlayer;
            
            // Ενημέρωση όλων των υπόλοιπων στο δωμάτιο
            socket.to(roomId).emit('updateBoard', { gridState, validatedSlots, currentPlayer: nextPlayer });
        }
    });

    socket.on('disconnect', () => {
        console.log(`Χρήστης αποσυνδέθηκε: ${socket.id}`);
        // Εδώ μελλοντικά μπορούμε να βάλουμε έλεγχο αν αποσυνδέθηκε κάποιος από ενεργό δωμάτιο
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Το MathDomino τρέχει στη θύρα ${PORT}`);
});