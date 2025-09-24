const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const Image = require('../models/Image');

// Multer setup for memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// =================================================================
// ## THIS IS THE MISSING FUNCTION THAT HAS BEEN RESTORED ##
// Helper function to upload a buffer to Cloudinary
const uploadToCloudinary = (buffer) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream((error, result) => {
      if (result) {
        resolve(result);
      } else {
        reject(error);
      }
    });
    stream.end(buffer);
  });
};
// =================================================================


// GET all images OR search for images
router.get('/', async (req, res) => {
  try {
    const { q } = req.query; 

    if (q) {
      const searchQuery = { $regex: q, $options: 'i' };
      let images = await Image.find({ title: searchQuery }).sort({ createdAt: -1 });

      if (images.length === 0) {
        images = await Image.find({ description: searchQuery }).sort({ createdAt: -1 });
      }
      res.json(images);
    } else {
      const images = await Image.find().sort({ createdAt: -1 });
      res.json(images);
    }
  } catch (err) {
    res.status(500).json({ message: 'Server Error' });
  }
});

// POST a new before-and-after image set
router.post('/', upload.fields([{ name: 'beforeImage', maxCount: 1 }, { name: 'afterImage', maxCount: 1 }]), async (req, res) => {
    const { title, description } = req.body;
    const beforeImageFile = req.files.beforeImage ? req.files.beforeImage[0] : null;
    const afterImageFile = req.files.afterImage ? req.files.afterImage[0] : null;

    if (!title || !description || !beforeImageFile || !afterImageFile) {
        return res.status(400).json({ message: 'All fields are required.' });
    }

    try {
        const [beforeResult, afterResult] = await Promise.all([
            uploadToCloudinary(beforeImageFile.buffer),
            uploadToCloudinary(afterImageFile.buffer)
        ]);

        const newImage = new Image({
            title,
            description,
            beforeImage: { url: beforeResult.secure_url, public_id: beforeResult.public_id },
            afterImage: { url: afterResult.secure_url, public_id: afterResult.public_id },
        });

        const savedImage = await newImage.save();
        res.status(201).json(savedImage);
    } catch (err) {
        res.status(500).json({ message: 'Failed to upload images.' });
    }
});

// PUT (update) an image entry
router.put('/:id', upload.fields([{ name: 'beforeImage', maxCount: 1 }, { name: 'afterImage', maxCount: 1 }]), async (req, res) => {
  try {
    const { title, description } = req.body;
    const entry = await Image.findById(req.params.id);
    if (!entry) return res.status(404).json({ message: 'Entry not found' });

    entry.title = title || entry.title;
    entry.description = description || entry.description;

    if (req.files && req.files.beforeImage) {
      await cloudinary.uploader.destroy(entry.beforeImage.public_id);
      const result = await uploadToCloudinary(req.files.beforeImage[0].buffer);
      entry.beforeImage = { url: result.secure_url, public_id: result.public_id };
    }

    if (req.files && req.files.afterImage) {
      await cloudinary.uploader.destroy(entry.afterImage.public_id);
      const result = await uploadToCloudinary(req.files.afterImage[0].buffer);
      entry.afterImage = { url: result.secure_url, public_id: result.public_id };
    }

    const updatedEntry = await entry.save();
    res.json(updatedEntry);
  } catch (err) {
    res.status(500).json({ message: 'Server Error' });
  }
});

// DELETE an image entry
router.delete('/:id', async (req, res) => {
  try {
    const entry = await Image.findById(req.params.id);
    if (!entry) return res.status(404).json({ message: 'Entry not found' });

    await Promise.all([
        cloudinary.uploader.destroy(entry.beforeImage.public_id),
        cloudinary.uploader.destroy(entry.afterImage.public_id)
    ]);

    await Image.deleteOne({ _id: req.params.id });

    res.json({ message: 'Entry deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server Error' });
  }
});

module.exports = router;