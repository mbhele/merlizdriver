const express = require('express');
const router = express.Router();
const passport = require('passport');  // Import only for login functionality
const User = require('../models/User');
const Trip = require('../models/Trip');
const Driver = require('../models/Driver');  // Correctly import the Driver model
const mongoose = require('mongoose');

// Middleware to check for valid ObjectId
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

// Admin Login GET handler (renders the login page)
router.get('/admin-login', (req, res) => {
  res.render('admin-login'); // Ensure you have a view named 'admin-login.ejs'
});

// Admin Login POST handler
router.post('/admin-login', (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) return next(err);
    if (!user) return res.status(400).json({ message: info.message });

    // Ensure the user has the 'admin' role
    if (user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admins only.' });
    }

    // Log the user in and redirect to the dashboard
    req.logIn(user, (err) => {
      if (err) return next(err);
      // Redirect to the admin dashboard
      return res.redirect('/admin/dashboard');
    });
  })(req, res, next);
});

// Admin Dashboard route
router.get('/dashboard', (req, res) => {
  res.render('dashboard', { user: req.user }); // User data is passed to the view
});

// Rides section route
router.get('/rides', async (req, res) => {
  try {
    const riders = await User.find({ role: 'rider' }).select('username email status'); // Fetch riders with status
    res.render('rider-dashboard', { riders });  // Ensure the view file is named 'rider-dashboard.ejs'
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Rider details route
router.get('/rides/:riderId', async (req, res) => {
  if (!isValidObjectId(req.params.riderId)) {
    return res.status(400).json({ message: 'Invalid Rider ID' });
  }

  try {
    const rider = await User.findById(req.params.riderId).select('username email phone status rideHistory currentLocation');
    const trips = await Trip.find({ rider: req.params.riderId }); // Fetch trips associated with this rider

    if (!rider) {
      return res.status(404).json({ message: 'Rider not found' });
    }

    res.render('rider-details', { rider, trips });  // Ensure you have a 'rider-details.ejs' view file
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get All Requested Trips
router.get('/trips', async (req, res) => {
  try {
    const trips = await Trip.find({ status: 'requested' })
      .populate('rider', 'username email')
      .populate('driver', 'username email')
      .sort({ createdAt: -1 });

    res.status(200).json({ trips });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Freeze a Trip
router.post('/freeze/:tripId', async (req, res) => {
  if (!isValidObjectId(req.params.tripId)) {
    return res.status(400).json({ message: 'Invalid Trip ID' });
  }

  try {
    const trip = await Trip.findById(req.params.tripId);
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }
    trip.status = 'frozen';
    await trip.save();
    res.json({ message: 'Trip frozen', trip });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Unfreeze a Trip
router.post('/unfreeze/:tripId', async (req, res) => {
  if (!isValidObjectId(req.params.tripId)) {
    return res.status(400).json({ message: 'Invalid Trip ID' });
  }

  try {
    const trip = await Trip.findById(req.params.tripId);
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }
    trip.status = 'requested';
    await trip.save();
    res.json({ message: 'Trip unfrozen', trip });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Approve a Trip
router.post('/approve/:tripId', async (req, res) => {
  if (!isValidObjectId(req.params.tripId)) {
    return res.status(400).json({ message: 'Invalid Trip ID' });
  }

  try {
    const trip = await Trip.findById(req.params.tripId).populate('rider');
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    trip.status = 'accepted';
    trip.approved = true;
    await trip.save();

    const io = req.app.get('socketio');
    io.to(trip.rider._id.toString()).emit('tripApproved', trip);

    res.status(200).json({ message: 'Trip approved', trip });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Driver List Route
router.get('/drivers', async (req, res) => {
  try {
    const drivers = await Driver.find().populate('userId', 'username email');
    res.render('driver-list', { drivers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Route to get driver details by ID
router.get('/drivers/:driverId', async (req, res) => {
  if (!isValidObjectId(req.params.driverId)) {
    return res.status(400).json({ message: 'Invalid Driver ID' });
  }

  try {
    const driver = await Driver.findById(req.params.driverId)
      .populate('userId', 'username email')
      .populate('rideHistory', 'origin destination fare status');

    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    res.render('driverDetails', { driver }); // Render EJS view with driver data
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// Route to delete driver and associated user by ID
router.delete('/drivers/:driverId/delete', async (req, res) => {
  if (!isValidObjectId(req.params.driverId)) {
    return res.status(400).json({ message: 'Invalid Driver ID' });
  }

  try {
    const driver = await Driver.findById(req.params.driverId);

    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    // Delete the associated user
    await User.findByIdAndDelete(driver.userId);

    // Delete the driver
    await Driver.findByIdAndDelete(req.params.driverId);

    res.status(200).json({ message: 'Driver and associated user deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Approve or Reject Driver
router.post('/drivers/:driverId/approve', async (req, res) => {
  if (!isValidObjectId(req.params.driverId)) {
    return res.status(400).json({ message: 'Invalid Driver ID' });
  }

  try {
    const { driverId } = req.params;
    const { action } = req.body; // 'approve' or 'reject'

    const driver = await Driver.findById(driverId);
    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    if (action === 'approve') {
      driver.approvalStatus = 'approved';
    } else if (action === 'reject') {
      driver.approvalStatus = 'rejected';
    } else {
      return res.status(400).json({ message: 'Invalid action' });
    }

    await driver.save();
    res.status(200).json({ message: `Driver ${action}d successfully`, driver });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reject a Trip
router.post('/reject/:tripId', async (req, res) => {
  if (!isValidObjectId(req.params.tripId)) {
    return res.status(400).json({ message: 'Invalid Trip ID' });
  }

  try {
    const trip = await Trip.findById(req.params.tripId).populate('rider');
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    trip.status = 'cancelled';
    trip.approved = false;
    await trip.save();

    const io = req.app.get('socketio');
    io.to(trip.rider._id.toString()).emit('tripRejected', trip);

    res.status(200).json({ message: 'Trip rejected', trip });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete User Route
router.delete('/delete/:id', async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid User ID' });
  }

  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Logout Route
router.post('/logout', (req, res) => {
  req.logout(function(err) {
    if (err) {
      return res.status(500).json({ message: 'Error logging out' });
    }
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: 'Error destroying session' });
      }
      // Redirect to the admin login page after logout
      res.redirect('/admin/admin-login');
    });
  });
});

module.exports = router;
