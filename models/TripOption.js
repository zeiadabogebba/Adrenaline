const mongoose = require('mongoose');

const tripOptionSchema = new mongoose.Schema({
  type:  { type: String, enum: ['destination', 'accommodation', 'room'], required: true },
  optId: { type: String, required: true },
  name:  { type: String, required: true },
  price: { type: Number, default: 0 },
  mult:  { type: Number, default: 1 },
});

module.exports = mongoose.model('TripOption', tripOptionSchema);
