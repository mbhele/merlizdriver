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
const tripRoutes = require('./routes/trip'); // Trip-related routes including notifications
const locationRoutes = require('./routes/location');
const chatRoutes = require('./routes/chat');
const productRoutes = require('./routes/productRoutes');
const apiProductRoutes = require('./routes/apiProductRoutes');
const orderRoutes = require('./routes/orderRoutes');
const driverRoutes = require('./routes/driver');
const tripCancellationRoutes = require('./routes/tripCancellationRoutes'); // Import the cancellation routes

// Initialize Express app and HTTP server
const app = express();
const server = http.createServer(app);

// Initialize Socket.IO with the server

const io = socketio(server);

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
      // Find the trip by ID and update location
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

    // Emit the tripApproved message to the rider's room
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

    // Emit the tripCancelled event to the rider in the trip room
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

    // Log the trip cancellation event
    console.log(`Trip ${tripId} cancelled by rider ${riderId}. Reason: ${reason}, Time: ${time}`);

    // Emit the tripCancelled event to notify the driver in the trip room
    io.to(tripId).emit('tripCancelled', {
      tripId,
      riderId,
      reason,
      time,
    });

    // Acknowledge receipt of cancellation event
    if (callback) callback({ status: 'received' });
  });
// Handle driver's arrival at the destination
socket.on('driverArrivedAtDestination', (data) => {
  const { tripId, driverId, time } = data;

  console.log(`Driver ${driverId} has arrived at the destination for trip ${tripId}. Time: ${time}`);

  // Emit the arrival event to the rider in the trip room
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
  origin: process.env.CORS_ORIGIN || 'https://merlizholdings.co.za', // Update this with your front-end URL
  credentials: true,
}));

// MongoDB connection
mongoose.connect(process.env.DB_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Session management
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.DB_URL, collectionName: 'sessions' }),
  cookie: { secure: false, maxAge: 1000 * 60 * 60 * 24 }, // 1-day session expiration
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

// Attach transporter to app for access in routes
app.set('transporter', transporter);

// Endpoint to send a message to any room (driver or rider)
app.post('/api/send-message', (req, res) => {
  const { message, roomId } = req.body;

  if (!message || !roomId) {
    return res.status(400).json({ error: 'Message and roomId are required.' });
  }

  // Emit the message to the specified room using Socket.IO
  const io = app.get('socketio');
  console.log(`Sending message to room: ${roomId}`);
  io.to(roomId).emit('message', { text: message });

  res.status(200).json({ message: 'Message sent successfully.' });
});

// Endpoint to send a message from driver to rider
app.post('/api/send-driver-message', (req, res) => {
  const { message, riderRoom } = req.body;

  if (!message || !riderRoom) {
    return res.status(400).json({ error: 'Message and riderRoom are required.' });
  }

  const io = app.get('socketio');
  console.log(`Sending message to riderRoom: ${riderRoom}`);
  io.to(riderRoom).emit('message', { text: message });
  res.status(200).json({ message: 'Message sent to rider successfully.' });
});

// Endpoint to send a message from rider to driver
app.post('/api/send-rider-message', (req, res) => {
  const { message, driverRoom } = req.body;

  if (!message || !driverRoom) {
    return res.status(400).json({ error: 'Message and driverRoom are required.' });
  }

  const io = app.get('socketio');
  console.log(`Sending message to driverRoom: ${driverRoom}`);
  io.to(driverRoom).emit('message', { text: message });
  res.status(200).json({ message: 'Message sent to driver successfully.' });
});

// Endpoint to notify a rider with a custom message
app.post('/api/notify-rider', (req, res) => {
  const { message, riderRoom } = req.body;

  if (!message || !riderRoom) {
    return res.status(400).json({ error: 'Message and riderRoom are required.' });
  }

  // Emit the message to the rider's room using Socket.IO
  const io = app.get('socketio');
  console.log(`Notifying riderRoom: ${riderRoom}`);
  io.to(riderRoom).emit('message', { text: message });

  res.status(200).json({ message: 'Message sent to rider successfully.' });
});
// Endpoint to test sending a message to the rider
app.post('/api/test-send-message', (req, res) => {
  const { tripId, message } = req.body;

  if (!tripId || !message) {
    return res.status(400).json({ error: 'Trip ID and message are required.' });
  }

  const io = app.get('socketio');
  console.log(`Testing: Sending message to room: ${tripId}`);
  
  // Emit the message to the specified trip room using Socket.IO
  io.to(tripId).emit('message', {
    type: 'testMessage',
    text: message,
  });

  res.status(200).json({ message: 'Test message sent successfully.' });
});

// Mount routes
app.use('/admin', adminRoutes);
app.use('/api/auth', authRoutes);
app.use('/seller', sellerRoutes);
app.use('/customer', customerRoutes);
app.use('/api/password-reset', passwordResetRoutes);
app.use('/foodFolder', foodFolderRoutes);
app.use('/api/rider', riderRoutes);
app.use('/api/trip', tripRoutes); // Trip routes, including notifications

app.use('/socket', locationRoutes);
app.use('/api/chat', chatRoutes);
app.use('/products', productRoutes);
app.use('/api/products', apiProductRoutes);
app.use('/api/orders', orderRoutes);
app.use('/driver', driverRoutes);
app.use('/', driverRoutes); // Use driver routes as root
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
