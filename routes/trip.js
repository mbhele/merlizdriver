require('dotenv').config(); // Load environment variables if not already done

const express = require('express');
const Trip = require('../models/Trip');
const Driver = require('../models/Driver');
// const { sendPushNotification } = require('../utils/notifications'); // Use notification utility for push notifications
const { ensureAuthenticated, ensureRole } = require('../middleware/auth');
const router = express.Router();
const geolib = require('geolib'); // You can use the 'geolib' package to calculate distance between coordinates

// Utility function to notify driver and wait for response
async function notifyDriverAndWait(driver, trip, timeout, req, notifiedDrivers) {
  const io = req.app.get('socketio');
  const tripId = trip._id.toString();

  // Check if driver has already been notified for this trip
  if (notifiedDrivers.has(driver._id.toString())) {
    console.log(`Driver ${driver._id} already notified for trip ${tripId}.`);
    return Promise.resolve(false); // Skip the driver
  }

  return new Promise((resolve) => {
    let isHandled = false; // Prevent race conditions
    notifiedDrivers.add(driver._id.toString()); // Mark driver as notified

    console.log(`Sending 'newTrip' event to driver ${driver._id} for trip ${tripId}`);
    io.to(driver._id.toString()).emit('newTrip', trip); // Emit to driver's unique room

    const responseListener = (response) => {
      console.log(`Received driver response for trip ${tripId} from driver ${response.driverId}`);

      if (!isHandled && response.tripId === tripId && response.driverId === driver._id.toString()) {
        isHandled = true; // Prevent further handling
        io.off('driverResponse', responseListener); // Clean up listener
        clearTimeout(timeoutId); // Clear the timeout
        resolve(response.accepted); // Resolve with driver's response
      }
    };

    io.on('driverResponse', responseListener);

    // Fallback after timeout
    const timeoutId = setTimeout(async () => {
      if (!isHandled) {
        console.log(`Timeout for driver ${driver._id} for trip ${tripId}`);
        isHandled = true; // Prevent further handling
        io.off('driverResponse', responseListener); // Clean up listener

        // Check if trip has already been accepted
        const latestTrip = await Trip.findById(tripId);
        if (latestTrip && latestTrip.status === 'accepted') {
          console.log(`Trip ${tripId} already accepted by another driver.`);
          resolve(false);
        } else {
          resolve(false); // Resolve as false if the driver did not respond
        }
      }
    }, timeout);
  });
}

// Function to check if the driver is at the destination
const hasArrivedAtDestination = (endLocation, destinationLocation) => {
  const distance = geolib.getDistance(
    { latitude: endLocation.latitude, longitude: endLocation.longitude },
    { latitude: destinationLocation.latitude, longitude: destinationLocation.longitude }
  );
  
  // If distance is less than 100 meters, consider the trip as completed
  return distance <= 100; // 100 meters
};

// Route to book a trip and notify the driver
router.post('/book-trip', ensureAuthenticated, ensureRole('rider'), async (req, res) => {
  try {
    const { rider, origin, destination, distance, fare, duration } = req.body;

    // Validation to ensure all fields are present
    if (!rider || !origin || !destination || !distance || !fare || !duration) {
      return res.status(400).json({ message: 'All fields are required: rider, origin, destination, distance, fare, and duration.' });
    }

    // Create a new trip
    const trip = new Trip({
      rider,
      origin,
      destination,
      fare,
      distance,
      duration,
      status: 'requested',
    });

    await trip.save();

    let maxAttempts = 6;
    const notifiedDrivers = new Set(); // Track notified drivers
    const io = req.app.get('socketio');

    while (maxAttempts > 0) {
      // Fetch available drivers
      const drivers = await Driver.find({
        status: { $in: ['online', 'idle'] }, // Include both 'online' and 'idle' drivers
        availability: true,
        _id: { $nin: Array.from(notifiedDrivers) }, // Exclude drivers already notified
      });

      if (drivers.length === 0) {
        console.log('No drivers found nearby');
        break;
      }

      for (const driver of drivers) {
        // Check if the trip has already been accepted
        const latestTrip = await Trip.findById(trip._id);
        if (latestTrip.status === 'accepted') {
          io.to(rider.toString()).emit('tripConfirmed', latestTrip);
          return res.status(200).json({ message: 'Trip already accepted by another driver.', trip: latestTrip });
        }

        // Notify driver and wait for response
        const driverAccepted = await notifyDriverAndWait(driver, trip, 12000, req, notifiedDrivers);

        if (driverAccepted) {
          trip.driver = driver._id;
          trip.status = 'accepted';
          await trip.save();

          driver.status = 'on_trip';
          driver.availability = false;
          await driver.save();

          io.to(driver._id.toString()).emit('tripConfirmed', trip);
          io.to(rider.toString()).emit('tripConfirmed', trip);

          return res.status(200).json({ message: 'Trip confirmed', trip });
        }

        notifiedDrivers.add(driver._id.toString()); // Add driver to the notified set
      }

      maxAttempts -= 1;
    }

    io.to(rider.toString()).emit('noDriversAvailable', {
      message: 'No drivers accepted the trip after multiple attempts.',
      tripId: trip._id,
    });

    return res.status(200).json({ message: 'No drivers accepted the trip after multiple attempts.', trip });
  } catch (error) {
    console.error('Error booking trip:', error.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Route for approving a trip
router.post('/approve/:tripId', ensureAuthenticated, ensureRole(['driver', 'admin']), async (req, res) => {
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

    trip.driver = driver._id;
    trip.status = 'accepted';
    trip.approved = true;
    await trip.save();

    res.status(200).json({ message: 'Trip approved', trip });
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Route for rejecting a trip
router.post('/reject/:tripId', ensureAuthenticated, ensureRole(['driver', 'admin']), async (req, res) => {
  try {
    const { driverId, reason } = req.body;
    const tripId = req.params.tripId;

    const driver = await Driver.findById(driverId);
    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    const trip = await Trip.findById(tripId).populate('rider');
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    trip.status = 'rejected';
    trip.rejectionReason = reason || 'No reason provided';
    await trip.save();

    res.status(200).json({ message: 'Trip rejected', trip });
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
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
      console.error('Drivers are not available');
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

module.exports = router;



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
