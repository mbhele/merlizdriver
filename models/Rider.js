const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const RiderSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  username: { type: String, required: true },
  phone: { type: String, required: true },
  profilePicture: { type: String },
  paymentMethods: [
    {
      type: { type: String, required: true, default: 'cash' },
      details: { type: Map, of: String, default: {} }
    }
  ],
  rideHistory: [{ type: Schema.Types.ObjectId, ref: 'Trip' }]
}, { timestamps: true });

module.exports = mongoose.model('Rider', RiderSchema);
