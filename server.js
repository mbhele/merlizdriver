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
const nodemailer = require('nodemailer'); // Import nodemailer
const initializeSocket = require('./socketHandler');  // Import the Socket.IO handler

// const initializeSocket = require('./socketHandler'); // Adjust the path if needed

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

// Initialize Express app and HTTP server
const app = express();
const server = http.createServer(app);

// Initialize Socket.IO with the server
const io = initializeSocket(server);

// Set Socket.IO instance to be accessible throughout the app
app.set('socketio', io);

// Middleware setup
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(methodOverride('_method'));
app.use(cors({ origin: 'http://192.168.43.59:5000', credentials: true }));

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

// Set up views and static files
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Nodemailer Transporter Setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  host: 'smtp.gmail.com',
  port: 587,
  secure: false, // Use TLS
  auth: {
    user: '1mbusombhele@gmail.com', // Replace with your Gmail email
    pass: 'rxyb eclg vpdy bghh', // Replace with your App Password
  },
});

// Email sending endpoint
app.post('/send-email', (req, res) => {
  const { to, subject, text } = req.body;

  const mailOptions = {
    from: '1mbusombhele@gmail.com', // Your email
    to, // Recipient email
    subject, // Subject line
    text, // Plain text body
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('Error sending email:', error);
      return res.status(500).json({ error: 'Failed to send email' });
    }
    console.log('Email sent:', info.response);
    res.status(200).json({ message: 'Email sent successfully' });
  });
});

// Mount routes
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

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, (err) => {
  if (err) {
    console.error(`Failed to start server: ${err.message}`);
  } else {
    console.log(`Server running on port ${PORT}`);
  }
});
