const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');
const Image = require('../models/Image'); // Adjust path if needed

// --- Multer and Cloudinary Setup ---

// Use memory storage to process files as buffers before they hit a disk
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Reusable helper function to upload a file buffer to Cloudinary with our desired optimizations
const uploadToCloudinary = (fileBuffer) => {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder: 'before-after', // Organizes uploads in your Cloudinary account
                // 1. Transformations for the main, optimized image
                transformation: [
                    { width: 1200, crop: 'limit' }, // Cap width at 1200px
                    { quality: 'auto' },             // Best quality for the file size
                    { fetch_format: 'auto' }        // Serve as WebP or AVIF if browser supports it
                ],
                // 2. Eagerly create the tiny, blurred placeholder on upload
                eager: [
                    { 
                        width: 20, 
                        crop: 'scale', 
                        effect: 'blur:1000', // Heavy blur for the placeholder effect
                        quality: '1'         // Lowest possible quality
                    }
                ]
            },
            (error, result) => {
                if (error) {
                    return reject(error);
                }
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
        // Search functionality
        const query = req.query.q || '';
        const searchCriteria = query 
            ? { $or: [
                  { title: { $regex: query, $options: 'i' } },
                  { description: { $regex: query, $options: 'i' } }
              ]} 
            : {};
        
        const images = await Image.find(searchCriteria).sort({ createdAt: -1 });
        res.json(images);
    } catch (err) {
        console.error("Error fetching images:", err);
        res.status(500).json({ message: 'Server Error' });
    }
});

/**
 * @route   POST /api/images
 * @desc    Upload a new before-and-after image set
 */
router.post('/', upload.fields([{ name: 'beforeImage', maxCount: 1 }, { name: 'afterImage', maxCount: 1 }]), async (req, res) => {
    const { title, description } = req.body;
    
    if (!req.files || !req.files.beforeImage || !req.files.afterImage) {
        return res.status(400).json({ message: 'Both "before" and "after" images are required.' });
    }

    try {
        // Upload both images to Cloudinary concurrently for speed
        const [beforeResult, afterResult] = await Promise.all([
            uploadToCloudinary(req.files.beforeImage[0].buffer),
            uploadToCloudinary(req.files.afterImage[0].buffer)
        ]);

        const newImage = new Image({
            title,
            description,
            beforeImage: {
                url: beforeResult.secure_url,
                public_id: beforeResult.public_id,
                placeholder: beforeResult.eager[0].secure_url
            },
            afterImage: {
                url: afterResult.secure_url,
                public_id: afterResult.public_id,
                placeholder: afterResult.eager[0].secure_url
            }
        });

        await newImage.save();
        res.status(201).json(newImage);

    } catch (err) {
        console.error('Upload Error:', err);
        res.status(500).json({ message: 'Failed to upload images.' });
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

        // Check if a new "before" image was uploaded
        if (req.files && req.files.beforeImage) {
            // Delete the old image from Cloudinary
            await cloudinary.uploader.destroy(imageEntry.beforeImage.public_id);
            // Upload the new one
            const newBeforeResult = await uploadToCloudinary(req.files.beforeImage[0].buffer);
            updateData.beforeImage = {
                url: newBeforeResult.secure_url,
                public_id: newBeforeResult.public_id,
                placeholder: newBeforeResult.eager[0].secure_url
            };
        }

        // Check if a new "after" image was uploaded
        if (req.files && req.files.afterImage) {
            await cloudinary.uploader.destroy(imageEntry.afterImage.public_id);
            const newAfterResult = await uploadToCloudinary(req.files.afterImage[0].buffer);
            updateData.afterImage = {
                url: newAfterResult.secure_url,
                public_id: newAfterResult.public_id,
                placeholder: newAfterResult.eager[0].secure_url
            };
        }

        const updatedImage = await Image.findByIdAndUpdate(req.params.id, updateData, { new: true });
        res.json(updatedImage);

    } catch (err) {
        console.error("Update Error:", err);
        res.status(500).json({ message: 'Failed to update entry.' });
    }
});

/**
 * @route   DELETE /api/images/:id
 * @desc    Delete an image entry
 */
router.delete('/:id', async (req, res) => {
    try {
        const imageEntry = await Image.findById(req.params.id);
        if (!imageEntry) {
            return res.status(404).json({ message: 'Image entry not found.' });
        }

        // Delete both images from Cloudinary using their public_ids
        await Promise.all([
            cloudinary.uploader.destroy(imageEntry.beforeImage.public_id),
            cloudinary.uploader.destroy(imageEntry.afterImage.public_id)
        ]);

        // Remove the entry from the database
        await imageEntry.deleteOne(); // or Image.findByIdAndDelete(req.params.id)

        res.json({ message: 'Image entry deleted successfully.' });
    } catch (err) {
        console.error("Delete Error:", err);
        res.status(500).json({ message: 'Failed to delete entry.' });
    }
});

module.exports = router;
