require('dotenv').config();

const express = require('express');
const router = express.Router();
const gatewayToken = process.env.GATEWAY_TOKEN;
const Contest = require('../models/Contest');

// Route voor het ophalen van een wedstrijden overzicht
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
        console.error('Fout bij het ophalen van wedstrijden:', error);
        res.status(500).json({ msg: 'Serverfout bij het ophalen van wedstrijden' });
    }
});

// Middleware om te controleren of het verzoek via de gateway komt
function verifyToken(req, res, next) {
    const token = req.header('Gateway');

    if (!token || token !== gatewayToken) {
        console.log('Unauthorized access detected.');
        return res.status(401).json({ msg: 'Ongeautoriseerde toegang' });
    } else {
        console.log('Access granted');
    }

    next();
}

module.exports = router;
