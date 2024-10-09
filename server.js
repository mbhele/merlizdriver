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
const Trip = require('./models/Trip'); // Ensure this path is correct


// app.get('/favicon.ico', (req, res) => res.status(204).end());

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
// const apiProductRoutes = require('./routes/apiProductRoutes');
const orderRoutes = require('./routes/orderRoutes');
const driverRoutes = require('./routes/driver');
const tripCancellationRoutes = require('./routes/tripCancellationRoutes'); // Import the cancellation routes

// Initialize Express app and HTTP server
const app = express();
const server = http.createServer(app);
app.get('/favicon.ico', (req, res) => res.status(204).end());
// Route to render landing.ejs
app.get('/', (req, res) => {
  res.render('landing');
});

// **1. Trust Proxy**
app.set('trust proxy', 1); // Trust first proxy

// **2. Socket.IO Configuration with CORS**
const io = socketio(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'https://merlizholdings.co.za',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});
// app.get('/favicon.ico', (req, res) => res.status(204).end());

// Set Socket.IO instance to be accessible throughout the app
app.set('socketio', io);

// **3. Socket.IO Connection Handling**
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

// **4. Middleware Setup**
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(methodOverride('_method'));

// **5. CORS Configuration for Express**
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'https://merlizholdings.co.za',
  credentials: true,
}));

// **6. MongoDB Connection**
mongoose.connect(process.env.DB_URL)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// **7. Session Management**
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.DB_URL, collectionName: 'sessions' }),
  cookie: { 
    secure: process.env.NODE_ENV === 'production', // Ensures cookies are only sent over HTTPS in production
    maxAge: 1000 * 60 * 60 * 24, // 1-day session expiration
    sameSite: 'lax', // Helps protect against CSRF attacks
  },
}));

// **8. Passport.js Setup**
app.use(flash());
app.use(passport.initialize());
app.use(passport.session());
require('./config/passport')(passport);

// **9. Set Up Views and Static Files**
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// **10. Nodemailer Transporter Setup**
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});
app.set('transporter', transporter);

// **11. Define Routes and Endpoints**
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
// app.use('/api/products', apiProductRoutes);
app.use('/api/orders', orderRoutes);
app.use('/driver', driverRoutes);
app.use('/', driverRoutes); // Use driver routes as root

// **12. Health Check Endpoint**
app.get('/ping', (req, res) => {
  res.status(200).send('Server is alive');
});

// **13. Define Additional Endpoints for Messaging**
// Serve the landing page at the root

/**
 * Endpoint to send a message to any room (driver or rider)
 */


// Route to handle favicon requests and return no content
// app.get('/favicon.ico', (req, res) => res.status(204).end());

app.post('/api/send-message', (req, res) => {
  const { message, roomId } = req.body;

  if (!message || !roomId) {
    return res.status(400).json({ error: 'Message and roomId are required.' });
  }

  // Emit the message to the specified room using Socket.IO
  const ioInstance = app.get('socketio');
  console.log(`Sending message to room: ${roomId}`);
  ioInstance.to(roomId).emit('message', { text: message });

  res.status(200).json({ message: 'Message sent successfully.' });
});

/**
 * Endpoint to send a message from driver to rider
 */
app.post('/api/send-driver-message', (req, res) => {
  const { message, riderRoom } = req.body;

  if (!message || !riderRoom) {
    return res.status(400).json({ error: 'Message and riderRoom are required.' });
  }

  const ioInstance = app.get('socketio');
  console.log(`Sending message to riderRoom: ${riderRoom}`);
  ioInstance.to(riderRoom).emit('message', { text: message });
  res.status(200).json({ message: 'Message sent to rider successfully.' });
});

/**
 * Endpoint to send a message from rider to driver
 */
app.post('/api/send-rider-message', (req, res) => {
  const { message, driverRoom } = req.body;

  if (!message || !driverRoom) {
    return res.status(400).json({ error: 'Message and driverRoom are required.' });
  }

  const ioInstance = app.get('socketio');
  console.log(`Sending message to driverRoom: ${driverRoom}`);
  ioInstance.to(driverRoom).emit('message', { text: message });
  res.status(200).json({ message: 'Message sent to driver successfully.' });
});

/**
 * Endpoint to notify a rider with a custom message
 */
app.post('/api/notify-rider', (req, res) => {
  const { message, riderRoom } = req.body;

  if (!message || !riderRoom) {
    return res.status(400).json({ error: 'Message and riderRoom are required.' });
  }

  // Emit the message to the rider's room using Socket.IO
  const ioInstance = app.get('socketio');
  console.log(`Notifying riderRoom: ${riderRoom}`);
  ioInstance.to(riderRoom).emit('message', { text: message });

  res.status(200).json({ message: 'Message sent to rider successfully.' });
});

/**
 * Endpoint to test sending a message to the rider
 */
app.post('/api/test-send-message', (req, res) => {
  const { tripId, message } = req.body;

  if (!tripId || !message) {
    return res.status(400).json({ error: 'Trip ID and message are required.' });
  }

  const ioInstance = app.get('socketio');
  console.log(`Testing: Sending message to room: ${tripId}`);

  // Emit the message to the specified trip room using Socket.IO
  ioInstance.to(tripId).emit('message', {
    type: 'testMessage',
    text: message,
  });

  res.status(200).json({ message: 'Test message sent successfully.' });
});
// app.get('/favicon.ico', (req, res) => res.status(204).end());

// **14. Start Server**
const PORT = process.env.PORT || 5000;
server.listen(PORT, (err) => {
  if (err) {
    console.error(`Failed to start server: ${err.message}`);
  } else {
    console.log(`Server running on port ${PORT}`);
  }
});
