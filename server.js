const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cloudinary = require('cloudinary').v2;
const cors = require('cors');

// Load env vars
dotenv.config();

// Initialize express app
const app = express();

// Middleware
app.use(cors()); // Allow requests from our frontend
app.use(express.json()); // To parse JSON bodies

// Cloudinary configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Database connection
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
}).then(() => console.log('MongoDB Connected...'))
  .catch(err => console.error(err));

// API Routes
app.use('/api/images', require('./routes/images'));

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));