const mongoose = require("mongoose");

const VisitorSchema = new mongoose.Schema({
  visitorId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  firstVisit: {
    type: Date,
    default: Date.now,
  },
  lastVisit: {
    type: Date,
    default: Date.now,
  },
  totalVisits: {
    type: Number,
    default: 1,
  },
  visitedPages: {
    type: [String],
    default: [],
  },
});

module.exports = mongoose.model("Visitor", VisitorSchema);
