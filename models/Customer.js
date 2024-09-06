const mongoose = require('mongoose');

const CustomerSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: true },
  profilePicture: { type: String },  // URL of the customer's profile picture
  invoicePicture: { type: String },  // URL of the invoice picture
  orders: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Order' }],
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Customer', CustomerSchema);
