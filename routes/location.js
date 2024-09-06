const express = require('express');
const router = express.Router();
const Driver = require('../models/Driver');

// Driver Location Update
router.post('/driverLocationUpdate', (req, res) => {
  const { driverId, location } = req.body;
  const io = req.io;
  io.emit('driverLocationUpdate', { driverId, location });
  res.status(200).json({ message: 'Driver location updated' });
});

// Rider Location Update
router.post('/riderLocationUpdate', (req, res) => {
  const { riderId, location } = req.body;
  const io = req.io;
  io.emit('riderLocationUpdate', { riderId, location });
  res.status(200).json({ message: 'Rider location updated' });
});

// Driver Status Update
router.post('/driverStatusUpdate', async (req, res) => {
  const { driverId, status } = req.body;
  const io = req.io;
  
  try {
    const driver = await Driver.findByIdAndUpdate(driverId, { status }, { new: true });
    
    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    io.emit('driverStatusUpdate', { driverId, status: driver.status });
    res.status(200).json({ message: 'Driver status updated', status: driver.status });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
