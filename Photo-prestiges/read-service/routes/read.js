require('dotenv').config({ path: '../.env' })

const express = require('express');
const router = express.Router();
const gatewayToken = process.env.GATEWAY_TOKEN;
const Contest = require('../models/Contest');

// Route for retrieving an overview of all contests
router.get('/get', verifyToken, async (req, res) => {
    try {
        const { page = 1, limit = 10, statusOpen} = req.query;

        const query = {};

        if (statusOpen !== undefined) {
            query.statusOpen = statusOpen === 'true';
        }

        const contests = await Contest.find(query)
            .skip((page - 1) * limit)
            .limit(limit);

        res.json(contests);
    } catch (error) {
        console.error('Error while retrieving contests:', error);
        res.status(500).json({ msg: 'Server error while trying to retrieve the contests' });
    }
});

// Middleware to check if the request is from the gateway
function verifyToken(req, res, next) {
    const token = req.header('Gateway');

    if (!token || token !== gatewayToken) {
        console.log('Unauthorized access detected.');
        return res.status(401).json({ msg: 'Unauthorized access.' });
    } else {
        console.log('Access granted.');
    }

    next();
}

module.exports = router;
