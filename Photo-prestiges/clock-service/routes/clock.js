require('dotenv').config({ path: '../.env' })

const express = require('express');
const router = express.Router();
const gatewayToken = process.env.GATEWAY_TOKEN;
const Contest = require('../models/Contest');
const mongoose = require("mongoose");

// Route for retrieving the remaining time of a contest
router.get('/get', verifyToken, async (req, res) => {
    try {
        const { contestId } = req.query;

        if (!mongoose.Types.ObjectId.isValid(contestId)) {
            return res.status(400).json({ msg: 'Invalid contest ID.' });
        }

        let contest = await Contest.findById(contestId);
        if(!contest) {
            return res.status(400).json({ msg: 'No contest found.'})
        }

        if (!contest.endTime) {
            return res.status(400).json({ msg: 'Contest does not have an endTime.' });
        }

        let now = new Date();
        let remaining = contest.endTime - now;
        if (remaining <= 0) {
            res.json({ msg: 'This contest ends on',  endTime: new Date(contest.endTime).toLocaleString() });
        } else {
            let days = Math.floor(remaining / (1000 * 60 * 60 * 24));
            let hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            let minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
            let seconds = Math.floor((remaining % (1000 * 60)) / 1000);

            res.json({ msg: 'The remaining time for this contest is: ', remaining: `${days} days:${hours} hours:${minutes} minutes:${seconds} seconds.` });
        }
    } catch (error) {
        console.error('Error while retrieving the remaining time of the contest:', error);
        res.status(500).json({ msg: 'Server error while retrieving the remaining time of the contest.' });
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
