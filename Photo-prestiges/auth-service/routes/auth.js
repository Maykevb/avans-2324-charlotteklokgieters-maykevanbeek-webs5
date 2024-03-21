require('dotenv').config();

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const gatewayToken = process.env.GATEWAY_TOKEN;

// Route voor het inloggen van een gebruiker
router.post('/login', verifyToken, async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ msg: 'Gebruiker niet gevonden' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ msg: 'Ongeldig wachtwoord' });
        }

        const payload = {
            user: {
                id: user.id
            }
        };

        jwt.sign(
            payload,
            process.env.JWT_SECRET,
            { expiresIn: 3600 },
            (err, token) => {
                if (err) throw err;
                res.json({ token });
            }
        );
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Serverfout');
    }
});

function verifyToken(req, res, next) {
    const token = req.header('Authorization').replace('Bearer ', '');

    if (!token || token !== gatewayToken) {
        console.log('Unauthorized access detected.');
        return res.status(401).json({ msg: 'Ongeautoriseerde toegang' });
    } else {
        console.log('Access granted.');
    }
    next();
}

module.exports = router;
