const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ReviewSchema = new Schema({
  tripId: { type: Schema.Types.ObjectId, ref: 'Trip', required: true },
  riderId: { type: Schema.Types.ObjectId, ref: 'Rider', required: true },
  driverId: { type: Schema.Types.ObjectId, ref: 'Driver', required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, maxlength: 500 },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Review', ReviewSchema);
