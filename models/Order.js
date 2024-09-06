const mongoose = require('mongoose');

const AddressSchema = new mongoose.Schema({
  address: { type: String, required: true },
  city: { type: String, required: true },
  zipcode: { type: String, required: true },
  coordinates: {
    type: [Number], // [longitude, latitude]
    required: true
  }
});

const OrderSchema = new mongoose.Schema({
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Referencing the User model
    required: true
  },
  items: [
    {
      productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
      name: { type: String, required: true },
      quantity: { type: Number, required: true },
      price: { type: Number, required: true }
    }
  ],
  addressType: {
    type: String,
    enum: ['myAddress', 'orderAddress'],
    required: true
  },
  selectedAddress: {
    type: AddressSchema,
    required: true
  },
  totalAmount: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['Pending', 'In Progress', 'Ready', 'Completed'],
    default: 'Pending'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Order', OrderSchema);
