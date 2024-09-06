const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  category: String,
  price: Number,
  quantity: Number,
  status: String,
  images: [String], // Array to store image URLs
  available: { type: Boolean, default: true }, // New field to track availability
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Product', productSchema);
