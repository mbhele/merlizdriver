const express = require('express');
const router = express.Router();
const ChatMessage = require('../models/ChatMessage');

// Join room
router.post('/join', (req, res) => {
  const { userId, tripId } = req.body;
  const io = req.app.get('socketio');
  io.to(tripId).emit('joinRoom', { userId, tripId });
  res.status(200).json({ message: `User ${userId} joined room ${tripId}` });
});

// Send message
router.post('/send', async (req, res) => {
  const { tripId, sender, senderRole, message } = req.body;
  const newMessage = new ChatMessage({
    tripId,
    sender,
    senderRole,
    message
  });

  try {
    await newMessage.save();
    const io = req.app.get('socketio');
    io.to(tripId).emit('chatMessage', newMessage);
    res.status(200).json({ message: `Message sent to trip ${tripId}` });
  } catch (error) {
    res.status(500).json({ message: 'Error sending message', error });
  }
});

// Get messages for a trip
router.get('/:tripId', async (req, res) => {
  const { tripId } = req.params;

  try {
    const messages = await ChatMessage.find({ tripId }).populate('sender', 'username');
    res.status(200).json(messages);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching messages', error });
  }
});

module.exports = router;
