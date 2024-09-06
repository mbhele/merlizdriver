require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const passport = require('passport');
const path = require('path');
const flash = require('connect-flash');
const http = require('http');
const { Server } = require('socket.io');
const Pusher = require('pusher');
const methodOverride = require('method-override');
const morgan = require('morgan'); // Import morgan

// Importing routes
const driverRoutes = require('./routes/driver');
const adminRoutes = require('./routes/admin');
const authRoutes = require('./routes/auth');
const sellerRoutes = require('./routes/seller');
const customerRoutes = require('./routes/customer');
const passwordResetRoutes = require('./routes/passwordReset');
const foodFolderRoutes = require('./routes/foodFolder');
const riderRoutes = require('./routes/rider');
const tripRoutes = require('./routes/trip');
const locationRoutes = require('./routes/location');
const chatRoutes = require('./routes/chat');
const productRoutes = require('./routes/productRoutes');
const apiProductRoutes = require('./routes/apiProductRoutes');
const orderRoutes = require('./routes/orderRoutes');

// Initialize Express app and HTTP server
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:5000', // Adjust this if your frontend runs on a different origin
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Configure Pusher
const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID,
  key: process.env.PUSHER_KEY,
  secret: process.env.PUSHER_SECRET,
  cluster: process.env.PUSHER_CLUSTER,
  useTLS: true,
});

// Set Socket.IO instance to be accessible throughout the app
app.set('socketio', io);

// Middleware setup
app.use(morgan('dev')); // Use morgan for logging HTTP requests
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(methodOverride('_method'));
app.use(cors({
  origin: 'http://192.168.43.59:5000', // Adjust this to your frontend origin
  credentials: true,
}));

// MongoDB connection
mongoose.connect(process.env.DB_URL)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Session management
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.DB_URL, collectionName: 'sessions' }),
  cookie: { secure: false, maxAge: 1000 * 60 * 60 * 24 }, // 1 day session expiration
}));

// Passport.js setup
app.use(flash());
app.use(passport.initialize());
app.use(passport.session());
require('./config/passport')(passport);

// EJS setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes
app.use('/api/auth', authRoutes);
app.use('/admin', adminRoutes);
app.use('/seller', sellerRoutes);
app.use('/customer', customerRoutes);
app.use('/api/password-reset', passwordResetRoutes);
app.use('/foodFolder', foodFolderRoutes);
app.use('/api/rider', riderRoutes);
app.use('/api/trip', tripRoutes);
app.use('/socket', locationRoutes);
app.use('/api/chat', chatRoutes);
app.use('/products', productRoutes);
app.use('/api/products', apiProductRoutes);
app.use('/api/orders', orderRoutes);
app.use('/driver', driverRoutes);

// Static Pages
app.get('/', (req, res) => res.render('landing', { isLoggedIn: req.isAuthenticated(), user: req.user }));
app.get('/register', (req, res) => res.render('register'));
app.get('/request-reset', (req, res) => res.render('request-reset'));
app.get('/reset/:token', (req, res) => res.render('reset-password', { token: req.params.token }));

// Logout
app.post('/logout', (req, res, next) => {
  req.logout(err => {
    if (err) return next(err);
    res.redirect('/');
  });
});

// Socket.IO Connection Handling
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Handle the 'joinRoom' event for users joining trip rooms
  socket.on('joinRoom', (data) => {
    if (data && data.userId && data.tripId) {
      const { userId, tripId } = data;
      const room = socket.rooms; // Get the current rooms of the socket

      // Check if the user is already in the room
      if (!room.has(tripId)) {
        socket.join(tripId);
        console.log(`User ${userId} joined room ${tripId}`);
      } else {
        console.log(`User ${userId} already in room ${tripId}, skipping...`);
      }
    } else {
      console.error('Invalid data received in joinRoom event:', data);
    }
  });

  // Listen for trip rejection from the driver
  socket.on('tripRejected', (data) => {
    console.log(`Trip rejected by driver ${data.driverId} (${data.driverUsername}) for trip ${data.tripId}`);
    console.log(`Driver Number Plate: ${data.plateNumber}`);
    console.log(`Driver Profile Picture: ${data.profilePicture}`);
    console.log(`Reject reason or additional details if any: ${data.reason || 'No reason provided'}`);

    // Additional logic to handle trip rejection, like notifying the next driver
    // Here you can proceed to notify the next driver
  });

  // Handle the 'approveTrip' event to emit approval notifications to the rider
  socket.on('approveTrip', ({ trip, profilePicture, plateNumber }) => {
    const riderRoom = trip.rider.toString();

    console.log(`Emitting tripApproved to room ${riderRoom} with data:`, {
      trip,
      driverPicture: profilePicture,
      driverNumberPlate: plateNumber,
    });

    // Emit the 'tripApproved' event to the rider's room via Socket.IO
    io.to(riderRoom).emit('tripApproved', {
      trip,
      driverPicture: profilePicture,
      driverNumberPlate: plateNumber,
    });
  });

  // Handle the 'tripCancelled' event to emit cancellation notifications
  socket.on('tripCancelled', ({ tripId, message }) => {
    console.log(`Trip ${tripId} has been cancelled. Reason: ${message}`);

    // Emit 'tripCancelled' event to all users in the trip room
    io.to(tripId).emit('tripCancelled', {
      message: message || 'The trip has been cancelled.',
    });
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something went wrong!');
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, (err) => {
  if (err) {
    console.error(`Failed to start server: ${err.message}`);
  } else {
    console.log(`Server running on port ${PORT}`);
  }
});
