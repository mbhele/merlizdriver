
require('dotenv').config(); // Load environment variables if not already done

const express = require('express');
const mongoose = require('mongoose');
const Trip = require('../models/Trip');
const Driver = require('../models/Driver');
const Pusher = require('pusher');

const User = require('../models/User');
const { ensureAuthenticated, ensureRole } = require('../middleware/auth');
const router = express.Router();
// Pusher configuration
// Configure Pusher
// Pusher configuration
const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID,
  key: process.env.PUSHER_KEY,
  secret: process.env.PUSHER_SECRET,
  cluster: process.env.PUSHER_CLUSTER,
  useTLS: true,
});

async function notifyDriverAndWait(driver, trip, timeout, req, notifiedDrivers) {
  const io = req.app.get('socketio');
  const tripId = trip._id.toString();
  const driverRoom = driver._id.toString();

  // Check if the driver has already been notified for this trip
  if (notifiedDrivers.has(driver._id.toString())) {
    console.log(`Driver ${driver._id} has already been notified for trip ${tripId}. Skipping...`);
    return Promise.resolve(false); // Skip this driver
  }

  return new Promise((resolve) => {
    let isHandled = false; // Flag to prevent race conditions
    notifiedDrivers.add(driver._id.toString()); // Mark this driver as notified

    console.log(`Emitting 'newTrip' event to driver ${driver._id} for trip ${tripId}`);
    io.to(driverRoom).emit('newTrip', trip);

    // Listener for driver response
    const responseListener = (response) => {
      console.log(`Received driver response for trip ${tripId} from driver ${response.driverId}`);

      if (!isHandled && response.tripId === tripId && response.driverId === driver._id.toString()) {
        console.log(`Driver ${driver._id} approved trip ${tripId}. Cleaning up...`);
        isHandled = true; // Set flag to prevent further handling
        io.off('driverResponse', responseListener); // Clean up the listener
        clearTimeout(timeoutId); // Clear the timeout
        resolve(response.accepted); // Resolve with the driver's response
      }
    };

    io.on('driverResponse', responseListener);

    // Fallback after the timeout
    const timeoutId = setTimeout(async () => {
      if (!isHandled) {
        console.log(`Timeout for driver ${driver._id} for trip ${tripId}`);
        isHandled = true; // Set flag to prevent further handling
        io.off('driverResponse', responseListener); // Clean up the listener on timeout
        
        // Check if the trip has already been accepted
        const latestTrip = await Trip.findById(tripId);
        if (latestTrip && latestTrip.status === 'accepted') {
          console.log(`Trip ${tripId} already accepted by another driver. No further action needed.`);
          resolve(false);
        } else {
          resolve(false); // Resolve with false as the driver did not respond in time
        }
      }
    }, timeout);
  });
}

// Server-side route handling
router.post('/book-trip', ensureAuthenticated, ensureRole('rider'), async (req, res) => {
  try {
    const { rider, origin, destination, distance, fare, duration } = req.body;

    // Validation to ensure all required fields are present
    if (!rider || !origin || !destination || !distance || !fare || !duration) {
      console.log('Validation error: Missing fields in request body:', req.body);
      return res.status(400).json({ message: 'All fields are required: rider, origin, destination, distance, fare, and duration.' });
    }

    // Create a new trip without coordinates
    const trip = new Trip({
      rider,
      origin,
      destination,
      fare,
      distance,
      duration,
      status: 'requested'
    });

    try {
      console.log('Saving trip data:', trip);
      await trip.save();
      console.log('Trip saved successfully');
    } catch (saveError) {
      console.error('Error saving trip:', saveError.message);
      return res.status(500).json({ error: 'Failed to save trip data' });
    }

    console.log('Searching for available drivers...');
    let maxAttempts = 6;
    const notifiedDrivers = new Set(); // Keep track of notified drivers
    const io = req.app.get('socketio');

    while (maxAttempts > 0) {
      const drivers = await Driver.find({
        status: 'online',
        availability: true
      });

      if (drivers.length === 0) {
        console.log('No drivers found nearby');
        break; // Exit loop if no drivers are available
      }

      console.log('Drivers found:', drivers.length);

      for (const driver of drivers) {
        console.log(`Sending trip request to driver ${driver._id}...`);

        // Check if the trip is already accepted by another driver
        const latestTrip = await Trip.findById(trip._id);
        if (latestTrip.status === 'accepted') {
          console.log(`Trip ${trip._id} already accepted. Stopping further requests.`);
          io.to(rider.toString()).emit('tripConfirmed', latestTrip); // Notify the rider about the trip confirmation
          return res.status(200).json({ message: 'Trip already accepted by another driver.', trip: latestTrip });
        }

        const driverAccepted = await notifyDriverAndWait(driver, trip, 6000, req, notifiedDrivers);

        if (driverAccepted) {
          trip.driver = driver._id;
          trip.status = 'accepted';
          await trip.save();

          driver.status = 'on_trip';
          driver.availability = false;
          await driver.save();

          // Emit socket events to the driver and rider
          io.to(driver._id.toString()).emit('tripConfirmed', trip);
          io.to(rider.toString()).emit('tripConfirmed', trip);

          console.log('Trip confirmed and driver assigned:', driver._id);
          return res.status(200).json({ message: 'Trip confirmed', trip });
        }
      }

      maxAttempts -= 1;
    }

    console.log('No drivers accepted the trip after multiple attempts');

    // Notify rider that no drivers are available
    io.to(rider.toString()).emit('noDriversAvailable', {
      message: 'No drivers accepted the trip after multiple attempts.',
      tripId: trip._id
    });

    // Return a 200 response with a message instead of 404 or 500
    return res.status(200).json({ message: 'No drivers accepted the trip after multiple attempts.', trip: trip });
  } catch (error) {
    console.error('Error booking trip:', error.message); // Log the exact error message
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});


router.post('/approve/:tripId', ensureAuthenticated, ensureRole(['driver', 'admin']), async (req, res) => {
  try {
    const { driverId, profilePicture, plateNumber } = req.body;

    const driver = await Driver.findById(driverId);
    if (!driver) {
      console.log('Driver not found');
      return res.status(404).json({ message: 'Driver not found' });
    }

    const trip = await Trip.findById(req.params.tripId).populate('rider');
    if (!trip) {
      console.log('Trip not found');
      return res.status(404).json({ message: 'Trip not found' });
    }

    trip.driver = driver._id;
    trip.status = 'accepted';
    trip.approved = true;
    await trip.save();

    console.log(`Trip approved by driver ${driver.name} (ID: ${driverId}) for trip ID: ${trip._id}`);

    res.status(200).json({ message: 'Trip approved', trip });
  } catch (error) {
    console.error('Error approving trip:', error.message);
    res.status(500).json({ error: error.message });
  }
});



// Reject a Trip
router.post('/reject/:tripId', ensureAuthenticated, ensureRole(['driver', 'admin']), async (req, res) => {
  try {
    const { driverId, profilePicture, plateNumber } = req.body;

    const driver = await Driver.findById(driverId);
    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    const trip = await Trip.findById(req.params.tripId).populate('rider');
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    trip.status = 'cancelled';
    trip.approved = false;
    await trip.save();

    // Log the driver's details
    console.log('Driver Username:', driver.name);
    console.log('Driver Number Plate:', plateNumber);
    console.log('Driver Profile Picture:', profilePicture);

    const io = req.app.get('socketio');
    io.to(trip.rider._id.toString()).emit('tripRejected', {
      trip,
      message: 'Please try again, drivers are not available at the moment.',
      driverUsername: driver.name,  // Include driver's username
    });

    res.status(200).json({ message: 'Trip rejected', trip });
  } catch (error) {
    console.error('Error rejecting trip:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Cancel a Trip Route
router.post('/cancel/:tripId', ensureAuthenticated, ensureRole(['rider', 'driver', 'admin']), async (req, res) => {
  try {
    const { driverId } = req.body; // Extract driverId from the request body
    const tripId = req.params.tripId;
    const trip = await Trip.findById(tripId);

    if (!trip) {
      console.error(`Trip not found for ID: ${tripId}`);
      return res.status(404).json({ message: 'Trip not found' });
    }

    if (!driverId) {
      console.error('Driver ID is missing');
      return res.status(400).json({ message: 'Driver ID is required' });
    }

    // Log the user who initiated the cancellation
    console.log(`User ${req.user.username} (Role: ${req.user.role}) is cancelling the trip ID: ${tripId}`);

    // Update the trip status to 'cancelled'
    trip.status = 'cancelled';
    await trip.save();

    // Get Socket.IO instance from app settings
    const io = req.app.get('socketio');

    // Emit the 'tripCancelled' event to both the rider and driver if they exist
    if (trip.rider && trip.driver) {
      io.to(trip.rider._id.toString()).emit('tripCancelled', {
        trip,
        message: 'The trip has been cancelled by the rider/driver/admin.',
      });
      io.to(trip.driver._id.toString()).emit('tripCancelled', {
        trip,
        message: 'The trip has been cancelled by the rider/driver/admin.',
      });
    } else {
      console.warn(`Rider or driver not found for trip ID: ${tripId}`);
    }

    // (Optional) Trigger a Pusher event for trip cancellation
    try {
      await pusher.trigger(`trip-channel-${trip.rider._id}`, 'trip-cancelled', { tripId });
      console.log('Pusher event triggered for trip cancellation.');
    } catch (pusherError) {
      console.error('Error triggering Pusher event:', pusherError);
    }

    // Respond with success message
    res.status(200).json({ message: 'Trip cancelled successfully', trip });
  } catch (error) {
    console.error('Error cancelling trip:', error.message);
    res.status(500).json({ message: `Failed to cancel trip: ${error.message}` }); // Ensure error message is sent
  }
});



// Get Available Trips for Drivers
router.get('/available-trips', ensureAuthenticated, ensureRole('driver'), async (req, res) => {
  try {
    console.log('Fetching available trips for driver:', req.user);

    const availableTrips = await Trip.find({ status: 'requested' })
      .populate('rider', 'username email')
      .sort({ createdAt: -1 });

    console.log('Trips found:', availableTrips);

    if (!availableTrips || availableTrips.length === 0) {
      return res.status(404).json({ message: 'No available trips found' });
    }

    res.status(200).json(availableTrips);
  } catch (error) {
    console.error('Error fetching available trips:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get Trip Status by ID
router.get('/status/:tripId', ensureAuthenticated, async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.tripId).populate('rider driver');
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }
    res.status(200).json({ trip });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Cancel a Trip
// Cancel a Trip Route
router.post('/cancel/:tripId', ensureAuthenticated, ensureRole(['rider', 'driver', 'admin']), async (req, res) => {
  try {
    const tripId = req.params.tripId;
    const trip = await Trip.findById(tripId);
    if (!trip) {
      console.error(`Trip not found for ID: ${tripId}`);
      return res.status(404).json({ message: 'Trip not found' });
    }

    // Log the user who initiated the cancellation
    console.log(`User ${req.user.username} (Role: ${req.user.role}) is cancelling the trip ID: ${tripId}`);

    // Update the trip status to 'cancelled'
    trip.status = 'cancelled';
    await trip.save();

    // Get Socket.IO instance from app settings
    const io = req.app.get('socketio');

    // Emit the 'tripCancelled' event to both the rider and driver
    if (trip.rider && trip.driver) {
      io.to(trip.rider._id.toString()).emit('tripCancelled', trip);
      io.to(trip.driver._id.toString()).emit('tripCancelled', trip);
    } else {
      console.warn(`Rider or driver not found for trip ID: ${tripId}`);
    }

    // (Optional) Trigger a Pusher event for trip cancellation
    try {
      await pusher.trigger(`trip-channel-${trip.rider._id}`, 'trip-cancelled', { tripId });
      console.log('Pusher event triggered for trip cancellation.');
    } catch (pusherError) {
      console.error('Error triggering Pusher event:', pusherError);
    }

    // Respond with success message
    res.status(200).json({ message: 'Trip cancelled successfully', trip });
  } catch (error) {
    console.error('Error cancelling trip:', error.message);
    res.status(500).json({ error: error.message });
  }
});


// Get trip history for a user
router.get('/history/:userId', ensureAuthenticated, async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).populate({
      path: 'rideHistory',
      populate: { path: 'rider driver', select: 'username' }
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json(user.rideHistory);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all bookings for a specific rider
router.get('/requests', ensureAuthenticated, ensureRole('rider'), async (req, res) => {
  try {
    const trips = await Trip.find({ rider: req.user.id })
      .populate('driver', 'name email phone vehicle')
      .populate('rider', 'username email phone')
      .sort({ createdAt: -1 }); // Sort by most recent first

    if (!trips || trips.length === 0) {
      return res.status(404).json({ message: 'No trip requests found' });
    }

    res.status(200).json(trips);
  } catch (error) {
    console.error('Error fetching trip requests:', error.message);
    res.status(500).json({ error: error.message });
  }
});

router.get('/fetch-trip/:tripId', ensureAuthenticated, ensureRole('rider'), async (req, res) => {
  try {
    const tripId = req.params.tripId;
    console.log('Trip ID:', tripId);
    console.log('Rider ID from JWT:', req.user._id);

    const trip = await Trip.findOne({ _id: tripId, rider: req.user._id })
      .populate('driver', 'profilePicture licensePlate');

    console.log('Trip found:', trip);

    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    res.json(trip);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});



module.exports = router;
