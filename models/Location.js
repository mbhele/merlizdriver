// models/Location.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const LocationSchema = new Schema({
  latitude: { type: Number, required: true }, // Latitude of the location
  longitude: { type: Number, required: true }, // Longitude of the location
  address: { type: String, required: true }, // Optional address for the location
  label: { type: String }, // Optional label to describe the location (e.g., "Pickup Point", "Dropoff Point")
}, { timestamps: true });

const Location = mongoose.model('Location', LocationSchema);
module.exports = Location;
