const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');
const Image = require('../models/Image'); // Ensure your model has beforeImage and afterImage fields

// --- Multer and Cloudinary Setup ---

// Use memory storage to process files as buffers
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Reusable helper function to upload a file buffer to Cloudinary
const uploadToCloudinary = (fileBuffer) => {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder: 'before-after', // Organizes uploads in your Cloudinary account
                transformation: [
                    { width: 1200, crop: 'limit' },
                    { quality: 'auto' },
                    { fetch_format: 'auto' }
                ]
            },
            (error, result) => {
                if (error) return reject(error);
                resolve(result);
            }
        );
        streamifier.createReadStream(fileBuffer).pipe(uploadStream);
    });
};


// --- API ROUTES ---

/**
 * @route   GET /api/images
 * @desc    Fetch all image entries
 */
router.get('/', async (req, res) => {
    try {
        const images = await Image.find({}).sort({ createdAt: -1 });
        res.json(images);
    } catch (err) {
        console.error("Error fetching images:", err);
        res.status(500).json({ message: 'Server Error' });
    }
});

/**
 * @route   POST /api/images
 * @desc    Upload a new before/after image set
 */
// Use upload.fields() to accept two optional files
router.post('/', upload.fields([{ name: 'beforeImage', maxCount: 1 }, { name: 'afterImage', maxCount: 1 }]), async (req, res) => {
    const { title, description } = req.body;
    
    // The 'afterImage' is required.
    if (!req.files || !req.files.afterImage) {
        return res.status(400).json({ message: 'The "After" image is required.' });
    }

    try {
        let beforeImageDetails = {};
        let afterImageDetails = {};

        // 1. Process After Image (Required)
        const afterResult = await uploadToCloudinary(req.files.afterImage[0].buffer);
        afterImageDetails = {
            url: afterResult.secure_url,
            public_id: afterResult.public_id,
        };

        // 2. Process Before Image (Optional)
        if (req.files && req.files.beforeImage) {
            // If the user uploaded a 'before' image, upload it
            const beforeResult = await uploadToCloudinary(req.files.beforeImage[0].buffer);
            beforeImageDetails = {
                url: beforeResult.secure_url,
                public_id: beforeResult.public_id,
            };
        } else {
            // If no 'before' image, create the placeholder/fake data
            beforeImageDetails = {
                url: 'https://via.placeholder.com/1200x1200.png?text=No+Before+Image',
                public_id: `placeholders/no-image-${Date.now()}` // Use a descriptive, non-colliding ID
            };
        }

        const newImage = new Image({
            title,
            description,
            beforeImage: beforeImageDetails,
            afterImage: afterImageDetails,
        });

        await newImage.save();
        res.status(201).json(newImage);

    } catch (err) {
        console.error('Upload Error:', err);
        res.status(500).json({ message: 'Failed to upload image set.' });
    }
});

/**
 * @route   PUT /api/images/:id
 * @desc    Update an image entry's text or replace images
 */
router.put('/:id', upload.fields([{ name: 'beforeImage', maxCount: 1 }, { name: 'afterImage', maxCount: 1 }]), async (req, res) => {
    try {
        const imageEntry = await Image.findById(req.params.id);
        if (!imageEntry) {
            return res.status(404).json({ message: 'Image entry not found.' });
        }

        const updateData = {
            title: req.body.title,
            description: req.body.description,
        };

        // Check if a new 'before' image was uploaded to replace the old one
        if (req.files && req.files.beforeImage) {
            // Only delete the old image if it's not a placeholder
            if (imageEntry.beforeImage && imageEntry.beforeImage.public_id && !imageEntry.beforeImage.public_id.startsWith('placeholders/')) {
                await cloudinary.uploader.destroy(imageEntry.beforeImage.public_id);
            }
            const newBeforeResult = await uploadToCloudinary(req.files.beforeImage[0].buffer);
            updateData.beforeImage = {
                url: newBeforeResult.secure_url,
                public_id: newBeforeResult.public_id,
            };
        }

        // Check if a new 'after' image was uploaded
        if (req.files && req.files.afterImage) {
            await cloudinary.uploader.destroy(imageEntry.afterImage.public_id);
            const newAfterResult = await uploadToCloudinary(req.files.afterImage[0].buffer);
            updateData.afterImage = {
                url: newAfterResult.secure_url,
                public_id: newAfterResult.public_id,
            };
        }

        const updatedImage = await Image.findByIdAndUpdate(req.params.id, { $set: updateData }, { new: true });
        res.json(updatedImage);

    } catch (err) {
        console.error("Update Error:", err);
        res.status(500).json({ message: 'Failed to update entry.' });
    }
});

/**
 * @route   DELETE /api/images/:id
 * @desc    Delete an image entry and its cloud assets
 */
router.delete('/:id', async (req, res) => {
    try {
        const imageEntry = await Image.findById(req.params.id);
        if (!imageEntry) {
            return res.status(404).json({ message: 'Image entry not found.' });
        }

        // Delete the 'after' image from Cloudinary
        await cloudinary.uploader.destroy(imageEntry.afterImage.public_id);
        
        // IMPORTANT: Only delete the 'before' image if it is NOT a placeholder
        if (imageEntry.beforeImage && imageEntry.beforeImage.public_id && !imageEntry.beforeImage.public_id.startsWith('placeholders/')) {
            await cloudinary.uploader.destroy(imageEntry.beforeImage.public_id);
        }

        // Remove the entry from the database
        await imageEntry.deleteOne();

        res.json({ message: 'Image entry deleted successfully.' });
    } catch (err) {
        console.error("Delete Error:", err);
        res.status(500).json({ message: 'Failed to delete entry.' });
    }
});

/**
 * @route   PATCH /api/images/:id/like
 * @desc    Increment the like count for an image
 */
router.patch('/:id/like', async (req, res) => {
  try {
    const image = await Image.findByIdAndUpdate(req.params.id, { $inc: { likes: 1 } }, { new: true });
    if (!image) {
      return res.status(404).json({ message: 'Image not found.' });
    }
    res.json(image);
  } catch (err) {
    console.error('Like Error:', err);
    res.status(500).json({ message: 'Server Error' });
  }
});

module.exports = router;
