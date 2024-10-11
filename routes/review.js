const express = require('express');
const router = express.Router();
const Review = require('../models/ReviewSchema'); // Assuming the Review model is in models/Review.js

// POST /reviews
router.post('/', async (req, res) => {
  const { tripId, riderId, driverId, rating, comment } = req.body;

  // Validation
  if (!tripId || !riderId || !driverId || !rating) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const review = new Review({
      tripId,
      riderId,
      driverId,
      rating,
      comment,
    });

    await review.save();
    res.status(201).json({ message: 'Review submitted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to submit review' });
  }
});

module.exports = router;
