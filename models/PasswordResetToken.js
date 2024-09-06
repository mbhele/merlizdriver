const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const PasswordResetTokenSchema = new Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'User',
  },
  token: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    required: true,
    default: Date.now,
    expires: 3600, // 1 hour
  },
});

module.exports = mongoose.model('PasswordResetToken', PasswordResetTokenSchema);
