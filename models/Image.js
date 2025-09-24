const mongoose = require('mongoose');

const ImageSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    required: true,
  },
  beforeImage: {
    url: { type: String, required: true },
    public_id: { type: String, required: true },
  },
  afterImage: {
    url: { type: String, required: true },
    public_id: { type: String, required: true },
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Image', ImageSchema);