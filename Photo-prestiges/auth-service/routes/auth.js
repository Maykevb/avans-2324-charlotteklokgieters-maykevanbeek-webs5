require('dotenv').config({ path: '../.env' })

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const gatewayToken = process.env.GATEWAY_TOKEN;

// Route for logging in for a user
router.post('/login', verifyToken, async (req, res) => {
    try {
        const { username, password } = req.body;

        const user = await User.findOne({ username });
        if (!user) {
            return res.status(400).json({ msg: 'User not found.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ msg: 'Invalid password.' });
        }

        const secretKey = checkRole(user.role);
        if (!secretKey) {
            return res.status(403).json({ msg: 'User has van invalid role.' });
        }

        const payload = {
            user: {
                id: user.id,
                username: user.username
            }
        };

        jwt.sign(
            payload,
            secretKey,
            { expiresIn: 3600 },
            (err, token) => {
                if (err) {
                    console.error(err.message);
                    return res.status(500).json({ msg: 'Something went wrong while generating the token.' });
                }
                res.json({ token });
            }
        );
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

// Check to retrieve the correct secret key based on the role of the user
function checkRole(role) {
    let secretKey;

    switch (role) {
        case "participant":
            secretKey = process.env.JWT_SECRET_PARTICIPANT;
            break;
        case "targetOwner":
            secretKey = process.env.JWT_SECRET_TARGETOWNER;
            break;
        default:
            return null;
    }

    return secretKey;
}

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
