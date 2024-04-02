require('dotenv').config();

const express = require('express');
const router = express.Router();
const gatewayToken = process.env.GATEWAY_TOKEN;
const Contest = require('../models/Contest');

// Route voor het ophalen van een wedstrijden overzicht
router.get('/get', verifyToken, async (req, res) => {
    try {
        const { contestId } = req.query;

        let contest = await Contest.findById(contestId);
        if(!contest) {
            return res.status(400).json({ msg: 'Er bestaat geen wedstrijd met deze ID'})
        }

        if (!contest.endTime) {
            return res.status(400).json({ msg: 'Eindtijd is niet ingevuld voor deze wedstrijd' });
        }

        let now = new Date();
        let remaining = contest.endTime - now;
        if (remaining <= 0) {
            res.json({ msg: 'Deze wedstrijd is afgelopen op',  endTime: new Date(contest.endTime).toLocaleString() });
        } else {
            let days = Math.floor(remaining / (1000 * 60 * 60 * 24));
            let hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            let minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
            let seconds = Math.floor((remaining % (1000 * 60)) / 1000);

            res.json({ msg: 'De resterende tijd voor deze wedstrijd is: ', remaining: `${days} dagen:${hours} uur:${minutes} minuten:${seconds} seconden` });
        }
    } catch (error) {
        console.error('Fout bij het ophalen van de resterende tijd van deze wedstrijd:', error);
        res.status(500).json({ msg: 'Serverfout bij het ophalen van de resterende tijd van deze wedstrijd' });
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
