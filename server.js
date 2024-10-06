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
const methodOverride = require('method-override');
const nodemailer = require('nodemailer');
const socketio = require('socket.io');
const Trip = require('./models/Trip'); // Assuming you already have your Trip model

// Importing routes
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
const driverRoutes = require('./routes/driver');
const tripCancellationRoutes = require('./routes/tripCancellationRoutes'); 

// Initialize Express app and HTTP server
const app = express();
const server = http.createServer(app);

// Initialize Socket.IO with the server and configure CORS
const io = socketio(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'https://merlizholdings.co.za',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Set Socket.IO instance to be accessible throughout the app
app.set('socketio', io);

// Socket.IO Connection
io.on('connection', (socket) => {
  console.log(`New client connected: ${socket.id}`);

  // Ensure client joins the room only once per trip
  socket.on('joinTripRoom', ({ tripId }) => {
    console.log(`Client ${socket.id} is joining trip room: ${tripId}`);
    if (socket.rooms.has(tripId)) {
      console.log(`Client ${socket.id} is already in the room: ${tripId}`);
    } else {
      socket.join(tripId);
      console.log(`Client ${socket.id} successfully joined trip room: ${tripId}`);
    }
  });

  // Ensure proper cleanup after trip ends
  socket.on('leaveTripRoom', ({ tripId }) => {
    console.log(`Client ${socket.id} leaving room: ${tripId}`);
    socket.leave(tripId);
  });

  // Listen for the join room event for chat rooms
  socket.on('joinChatRoom', ({ roomId }) => {
    console.log(`Client ${socket.id} is joining room: ${roomId}`);
    socket.join(roomId);
    console.log(`Client ${socket.id} successfully joined room: ${roomId}`);
  });

  // Handle driver's location update
  socket.on('driverLocationUpdate', async (data) => {
    const { tripId, driverId, location } = data;
    console.log(`Driver ${driverId} sent location update for trip ${tripId}:`, location);

    try {
      const trip = await Trip.findById(tripId);
      if (trip) {
        trip.locationUpdates.push({
          latitude: location.latitude,
          longitude: location.longitude,
          timestamp: new Date(),
        });
        await trip.save();
        io.to(tripId).emit('driverLocationUpdate', { tripId, driverId, location });
      }
    } catch (error) {
      console.error('Error saving location update:', error);
    }
  });

  // Handle driver's acceptance of the trip
  socket.on('driverResponse', (data) => {
    const { driverId, tripId, accepted } = data;

    if (accepted) {
      console.log(`Driver ${driverId} accepted trip ${tripId}`);
      io.to(tripId).emit('message', {
        type: 'tripApproved',
        text: 'Your trip has been accepted by the driver.',
        driverId,
      });
    }
  });

  // Handle trip cancellation by the driver
  socket.on('tripCancelledByDriver', (data) => {
    const { tripId, driverId, reason, location, time } = data;
    console.log(`Trip ${tripId} cancelled by driver ${driverId}. Reason: ${reason}, Location: ${JSON.stringify(location)}, Time: ${time}`);

    io.to(tripId).emit('tripCancelled', {
      tripId,
      driverId,
      reason,
      location,
      time,
    });
  });

  // Handle trip cancellation by the rider
  socket.on('tripCancelledByRider', (data, callback) => {
    const { tripId, riderId, reason, time } = data;

    console.log(`Trip ${tripId} cancelled by rider ${riderId}. Reason: ${reason}, Time: ${time}`);

    io.to(tripId).emit('tripCancelled', {
      tripId,
      riderId,
      reason,
      time,
    });

    if (callback) callback({ status: 'received' });
  });

  // Handle driver's arrival at the destination
  socket.on('driverArrivedAtDestination', (data) => {
    const { tripId, driverId, time } = data;

    console.log(`Driver ${driverId} has arrived at the destination for trip ${tripId}. Time: ${time}`);

    io.to(tripId).emit('message', {
      type: 'arrivedAtDestination',
      text: 'The driver has arrived at your destination.',
      driverId,
      time,
    });
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// Middleware setup
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(methodOverride('_method'));
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'https://merlizholdings.co.za',
  credentials: true,
}));

// MongoDB connection
mongoose.connect(process.env.DB_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Session management
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.DB_URL, collectionName: 'sessions' }),
  cookie: { secure: false, maxAge: 1000 * 60 * 60 * 24 },
}));

// Passport.js setup
app.use(flash());
app.use(passport.initialize());
app.use(passport.session());
require('./config/passport')(passport);

// Set up views and static files
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Nodemailer Transporter Setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});
app.set('transporter', transporter);

// Routes and Endpoints
app.use('/admin', adminRoutes);
app.use('/api/auth', authRoutes);
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
app.use('/', driverRoutes);
app.get('/ping', (req, res) => {
  res.status(200).send('Server is alive');
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
