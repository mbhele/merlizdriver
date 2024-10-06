const express = require('express');
const Trip = require('../models/Trip');
const TripCancellation = require('../models/TripCancellation'); // Import the TripCancellation model
const router = express.Router();

// Route to cancel a trip
router.put('/cancel-trip/:tripId', async (req, res) => {
  const { tripId } = req.params;
  const { cancelledBy, reason } = req.body; // Get who canceled and the reason from the request body

  try {
    // Find the trip by ID
    const trip = await Trip.findById(tripId);
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    // Update trip status to 'cancelled'
    trip.status = 'cancelled';
    await trip.save();

    // Create a new cancellation record
    const tripCancellation = new TripCancellation({
      tripId: trip._id,
      cancelledBy,
      reason,
    });
    await tripCancellation.save();

    return res.status(200).json({
      message: 'Trip has been cancelled successfully',
      trip,
      tripCancellation,
    });
  } catch (error) {
    console.error('Error cancelling trip:', error.message);
    return res.status(500).json({ message: 'Error cancelling trip', error: error.message });
  }
});

// Route to end a trip
router.put('/end-trip/:tripId', async (req, res) => {
  const { tripId } = req.params;
  const { latitude, longitude } = req.body; // Get driver's final location

  try {
    // Find the trip by ID
    const trip = await Trip.findById(tripId);
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    // Update trip status to 'completed' and save the final location
    trip.status = 'completed';
    trip.finalLocation = {
      latitude,
      longitude,
    };
    await trip.save();

    return res.status(200).json({
      message: 'Trip has been completed successfully',
      trip,
    });
  } catch (error) {
    console.error('Error ending trip:', error.message);
    return res.status(500).json({ message: 'Error ending trip', error: error.message });
  }
});

module.exports = router;
