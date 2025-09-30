const express = require('express');
const router = express.Router();
const Visitor = require('../models/Visitor');

/**
 * @route   POST /api/track-view
 * @desc    Tracks a page view for a unique visitor
 */
router.post('/track-view', async (req, res) => {
    const { visitorId, pageUrl } = req.body;

    if (!visitorId || !pageUrl) {
        return res.status(400).json({ message: 'visitorId and pageUrl are required.' });
    }

    try {
        const update = {
            $set: { lastVisit: new Date() },
            $inc: { totalVisits: 1 },
            $addToSet: { visitedPages: pageUrl }, // $addToSet prevents duplicate URLs
            $setOnInsert: { firstVisit: new Date(), visitorId: visitorId }
        };

        // Find a visitor by visitorId and update them, or create a new entry if not found.
        const visitor = await Visitor.findOneAndUpdate({ visitorId }, update, {
            new: true, // Return the modified document
            upsert: true, // Create a new document if one doesn't exist
        });

        res.status(200).json({ message: 'View tracked successfully.', visitor });

    } catch (err) {
        console.error("Tracking Error:", err);
        res.status(500).json({ message: 'Server Error' });
    }
});


/**
 * @route   GET /api/view-stats
 * @desc    Get total unique visitors and total page views
 */
router.get('/view-stats', async (req, res) => {
    try {
        // Get the count of all documents in the Visitor collection
        const totalUniqueVisitors = await Visitor.countDocuments();

        // Use aggregation to sum the totalVisits field across all documents
        const totalViewsResult = await Visitor.aggregate([
            {
                $group: {
                    _id: null, // Group all documents into a single result
                    totalViews: { $sum: '$totalVisits' }
                }
            }
        ]);
        
        // Extract the totalViews value, defaulting to 0 if no visitors exist yet
        const totalViews = totalViewsResult.length > 0 ? totalViewsResult[0].totalViews : 0;

        res.json({ totalUniqueVisitors, totalViews });

    } catch (err) {
        console.error("Stats Error:", err);
        res.status(500).json({ message: 'Server Error' });
    }
});


module.exports = router;