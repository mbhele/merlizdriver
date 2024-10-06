const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Rider = require('../models/Rider');
const User = require('../models/User');
const { ensureAuthenticated, ensureRole } = require('../middleware/auth');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

// Function to generate JWT token without expiration
const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, username: user.username, email: user.email, role: user.role },
    JWT_SECRET
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


router.post('/register', async (req, res) => {
  const { username, password, email, role, phone, profilePicture } = req.body;

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      username,
      password: hashedPassword,
      email,
      role: role || 'rider', // Default to 'rider' if no role is provided
      phone,
      profilePicture,
    });
    await newUser.save();

    if (role === 'rider' || !role) {
      const newRider = new Rider({
        userId: newUser._id,
        username,
        phone,
        profilePicture,
        paymentMethods: [],
        rideHistory: [],
      });
      await newRider.save();
      console.log('Rider created with userId:', newUser._id);
    }

    const token = generateToken(newUser);

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
    console.error('Registration error:', err);
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

router.put('/:id', ensureAuthenticated, async (req, res) => {
  const session = await User.startSession();
  session.startTransaction();

  try {
    const { username, email, phone, profilePicture } = req.body;
    console.log('Received update request for ID:', req.params.id);  // Debugging

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      { username, email, phone, profilePicture },
      { new: true, session }
    );

    if (!updatedUser) {
      console.log('User not found for ID:', req.params.id);  // Debugging
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'User not found' });
    }

    const updatedRider = await Rider.findOneAndUpdate(
      { userId: req.params.id },
      { username, phone, profilePicture },
      { new: true, session }
    );

    if (!updatedRider) {
      console.log('Rider not found for User ID:', req.params.id);  // Debugging
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Rider not found' });
    }

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({ 
      message: 'Profile updated successfully', 
      user: {
        ...updatedUser.toObject(),
        riderId: updatedRider._id,
      },
    });
  } catch (error) {
    console.error('Error updating profile:', error);  // Debugging
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ error: 'Failed to update profile' });
  }
});



// Logout route for rider
router.post('/logout', ensureAuthenticated, (req, res) => {
  req.user = null; // Invalidate the user session (JWT token)
  res.status(200).json({ message: 'Logged out successfully' });
});
// Get recent searches for a specific rider
// Get recent searches for a specific rider
// Get recent searches for a specific rider
// Get recent searches for a specific rider
router.get('/:userId/recentSearches', ensureAuthenticated, async (req, res) => {
  try {
    const { userId } = req.params;
    console.log('Fetching recent searches for Rider with User ID:', userId); // Debugging

    // Find the Rider by userId instead of _id
    const rider = await Rider.findOne({ userId });

    if (!rider) {
      return res.status(404).json({ message: 'Rider not found' });
    }

    // Assuming `recentSearches` is part of the rider schema
    res.status(200).json(rider.recentSearches || []);
  } catch (error) {
    console.error('Error fetching recent searches:', error.message);
    res.status(500).json({ error: 'Failed to fetch recent searches' });
  }
});




// Save a recent search for a rider
// Save a recent search for a rider by userId
router.post('/:userId/saveSearch', ensureAuthenticated, async (req, res) => {
  try {
    const { userId } = req.params; // This is the user's ID (referenced in the Rider schema as userId)
    const { address, latitude, longitude } = req.body;

    // Find the Rider using the userId field
    const rider = await Rider.findOne({ userId });
    if (!rider) {
      return res.status(404).json({ message: 'Rider not found' });
    }

    // Add the new search to recent searches
    rider.recentSearches.push({ address, latitude, longitude });

    // Limit the recent searches to the last 5
    if (rider.recentSearches.length > 5) {
      rider.recentSearches.shift();
    }

    await rider.save();

    res.status(201).json({ message: 'Search saved successfully' });
  } catch (error) {
    console.error('Error saving recent search:', error.message);
    res.status(500).json({ error: 'Failed to save recent search' });
  }
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
