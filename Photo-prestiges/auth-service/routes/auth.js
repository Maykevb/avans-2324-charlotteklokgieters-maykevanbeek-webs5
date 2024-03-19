const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken'); // Voeg JWT toe
const User = require('../models/User');
require('dotenv').config();

// Route voor het inloggen van een gebruiker
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Controleer of de gebruiker bestaat
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ msg: 'Gebruiker niet gevonden' });
        }

        // Controleer of het wachtwoord overeenkomt
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ msg: 'Ongeldig wachtwoord' });
        }

        // JWT-payload aanmaken
        const payload = {
            user: {
                id: user.id
            }
        };

        // Token genereren
        jwt.sign(
            payload,
            process.env.JWT_SECRET, // Gebruik een geheime sleutel, bijv. uit een environment variabele
            { expiresIn: 3600 }, // Optioneel: token vervalt na 1 uur
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

module.exports = router;
