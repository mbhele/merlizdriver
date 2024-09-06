const express = require('express');
const router = express.Router();
const passport = require('passport');  // Import only for login functionality
const User = require('../models/User');
const Trip = require('../models/Trip');
const Driver = require('../models/Driver');  // Correctly import the Driver model

// Admin Login GET handler (renders the login page)
router.get('/admin-login', (req, res) => {
  res.render('admin-login'); // Ensure you have a view named 'admin-login.ejs'
});

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


// Admin Dashboard (now unprotected route)
router.get('/dashboard', (req, res) => {
  res.render('dashboard', { user: null }); // User is set to null for no authentication
});

// Sellers section route (now unprotected)
router.get('/sellers', async (req, res) => {
  try {
    const sellers = await User.find({ role: 'seller' }).select('username email createdAt');
    res.json({ sellers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Rides section route (now unprotected)
// Rides section route (now unprotected)
// Rides section route (now unprotected)
// Riders section route (now unprotected)
// Riders section route (now unprotected)
router.get('/rides', async (req, res) => {
  try {
    // Fetch riders from the database
    const riders = await User.find({ role: 'rider' }).select('username email status'); // Fetch riders with status

    // Render the view and pass riders data to it
    res.render('rider-dashboard', { riders });  // Ensure the view file is named 'rider-dashboard.ejs'
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Rider details route
router.get('/rides/:riderId', async (req, res) => {
  try {
    const rider = await User.findById(req.params.riderId).select('username email phone status rideHistory currentLocation');
    const trips = await Trip.find({ rider: req.params.riderId }); // Fetch trips associated with this rider
    
    if (!rider) {
      return res.status(404).json({ message: 'Rider not found' });
    }

    // Render the rider details view
    res.render('rides', { rider, trips });  // Ensure you have a 'rider-details.ejs' view file
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Get All Requested Trips (now unprotected)
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

// // Driver Details route (now unprotected)
// router.get('/rides/:driverId', async (req, res) => {
//   try {
//     const driver = await User.findById(req.params.driverId).populate('rideHistory');
//     const trips = await Trip.find({ driver: driver._id }).populate('rider');
//     res.json({ driver, trips });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

// Freeze a Trip (now unprotected)
router.post('/freeze/:tripId', async (req, res) => {
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

// Unfreeze a Trip (now unprotected)
router.post('/unfreeze/:tripId', async (req, res) => {
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

// Approve a Trip (now unprotected)
router.post('/approve/:tripId', async (req, res) => {
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
// Example route in your Express app
router.get('/drivers', async (req, res) => {
  try {
    const drivers = await Driver.find().populate('userId', 'username email');
    res.render('driver-list', { drivers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Driver Details Route
router.get('/drivers/:driverId', async (req, res) => {
  try {
    const driver = await Driver.findById(req.params.driverId)
      .populate('rideHistory', 'origin destination fare status')
      .populate('userId', 'username email');

    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    res.status(200).json({ driver });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Reject a Trip (now unprotected)
router.post('/reject/:tripId', async (req, res) => {
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

// Delete User Route (now unprotected)
router.delete('/delete/:id', async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Logout Route
router.post('/logout', (req, res) => {
  res.json({ message: 'Logout functionality will be added later' });
});

module.exports = router;
