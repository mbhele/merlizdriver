const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Rider = require('../models/Rider');
const User = require('../models/User');
const Trip = require('../models/Trip');
// const { ensureAuthenticated } = require('../middleware/auth');
const { ensureAuthenticated, ensureRole } = require('../middleware/auth');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

// Function to generate JWT token
const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, username: user.username, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '3h' }
  );
};

router.post('/login', async (req, res) => {
  console.log('Request body:', req.body);  // Log the incoming request body

  const { username, password } = req.body;
  console.log('Login attempt:', { username, password });

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }

  const user = await User.findOne({ username, role: 'rider' });
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return res.status(400).json({ message: 'Invalid credentials' });
  }

  const token = generateToken(user);

  // Fetch the Rider details to include in the response
  const rider = await Rider.findOne({ userId: user._id });

  res.status(200).json({
    user: {
      username: user.username,
      email: user.email,
      role: user.role,
      phone: user.phone,
      profilePicture: user.profilePicture,
      availability: user.availability,
      status: user.status,
      rideHistory: user.rideHistory,
      _id: user._id,
      paymentMethods: user.paymentMethods,
      createdAt: user.createdAt,
      riderId: rider ? rider._id : null,
      riderProfilePicture: rider ? rider.profilePicture : null,
    },
    token,
  });
});



// Register rider
router.post('/register', async (req, res) => {
  const { username, password, email, role, phone, profilePicture } = req.body;

  try {
    // Check if the email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create a new user
    const newUser = new User({
      username,
      password: hashedPassword,
      email,
      role: role || 'customer', // Default to customer if no role is provided
      phone,
      profilePicture,
    });
    await newUser.save();

    // If the role is 'rider', create a Rider document
    if (role === 'rider') {
      const newRider = new Rider({
        userId: newUser._id,
        username,
        phone,
        profilePicture,
        paymentMethods: [],
        rideHistory: [],
      });
      await newRider.save();
    }

    const token = generateToken(newUser);

    // Return the user details along with the token
    return res.json({
      message: 'User registered successfully',
      token,
      user: {
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
        phone: newUser.phone,
        profilePicture: newUser.profilePicture,
        availability: newUser.availability,
        status: newUser.status,
        rideHistory: newUser.rideHistory,
        _id: newUser._id,
        paymentMethods: newUser.paymentMethods,
        createdAt: newUser.createdAt,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get rider by Rider's _id
router.get('/:id', ensureAuthenticated, async (req, res) => {
  try {
    const rider = await Rider.findById(req.params.id); // Using Rider's _id directly
    if (!rider) {
      return res.status(404).json({ message: 'Rider not found' });
    }

    res.status(200).json(rider);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update rider profile
router.put('/:id', ensureAuthenticated, async (req, res) => {
  try {
    const { username, email, phone, profilePicture } = req.body;

    // Update User document
    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      { username, email, phone, profilePicture },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update Rider document
    const updatedRider = await Rider.findOneAndUpdate(
      { userId: req.params.id },
      { username, phone, profilePicture },
      { new: true }
    );

    if (!updatedRider) {
      return res.status(404).json({ message: 'Rider not found' });
    }

    res.status(200).json({ 
      message: 'Profile updated successfully', 
      user: {
        ...updatedUser.toObject(),
        riderId: updatedRider._id,
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Logout route for rider
router.post('/logout', ensureAuthenticated, (req, res) => {
  req.user = null; // Invalidate the user session (JWT token)
  res.status(200).json({ message: 'Logged out successfully' });
});

// Get all bookings by a rider
router.get('/:riderId/bookings', ensureAuthenticated, async (req, res) => {
  try {
    const { riderId } = req.params;
    const bookings = await Trip.find({ rider: riderId })
      .populate('driver', 'name email phone vehicle')
      .populate('rider', 'username email phone')
      .sort({ createdAt: -1 }); // Sort by most recent first

    res.status(200).json(bookings);
  } catch (error) {
    console.error('Error fetching rider bookings:', error.message);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// Get all bookings (for admin or reporting)
router.get('/bookings', ensureAuthenticated, ensureRole(['admin']), async (req, res) => {
  try {
    const bookings = await Trip.find()
      .populate('driver', 'name email phone vehicle')
      .populate('rider', 'username email phone')
      .sort({ createdAt: -1 }); // Sort by most recent first

    res.status(200).json(bookings);
  } catch (error) {
    console.error('Error fetching all bookings:', error.message);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// Get all trip requests for a specific rider
router.get('/requests/:riderId', ensureAuthenticated, ensureRole(['rider', 'admin']), async (req, res) => {
  try {
    const { riderId } = req.params;
    const trips = await Trip.find({ rider: riderId })
      .populate('driver', 'name email phone vehicle')
      .populate('rider', 'username email phone')
      .sort({ createdAt: -1 }); // Sort by most recent first

    if (!trips.length) {
      return res.status(404).json({ message: 'No trip requests found for this rider' });
    }

    res.status(200).json(trips);
  } catch (error) {
    console.error('Error fetching trip requests:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get all requests made by a rider
router.get('/requests', ensureAuthenticated, ensureRole('rider'), async (req, res) => {
  try {
    // Assuming that `req.user.id` is the authenticated rider's ID
    const trips = await Trip.find({ rider: req.user.id })
      .populate('driver', 'name email phone vehicle')
      .populate('rider', 'username email phone')
      .sort({ createdAt: -1 }); // Sort by most recent first

    if (!trips || trips.length === 0) {
      return res.status(404).json({ message: 'No trip requests found for this rider' });
    }

    res.status(200).json(trips);
  } catch (error) {
    console.error('Error fetching trip requests:', error.message);
    res.status(500).json({ error: error.message });
  }
});



module.exports = router;
