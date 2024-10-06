// models/TripCancellation.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const TripCancellationSchema = new Schema({
  tripId: { type: Schema.Types.ObjectId, ref: 'Trip', required: true }, // Reference to the canceled trip
  cancelledBy: { type: String, enum: ['rider', 'driver'], required: true }, // Who canceled the trip
  reason: { type: String }, // Reason for cancellation (optional)
  cancelledAt: { type: Date, default: Date.now }, // Timestamp of when the trip was canceled
}, { timestamps: true });

const TripCancellation = mongoose.model('TripCancellation', TripCancellationSchema);
module.exports = TripCancellation;
