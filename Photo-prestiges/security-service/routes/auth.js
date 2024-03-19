const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Route voor inloggen
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Zoek de gebruiker in de lokale database van de security-service
        const user = await User.findOne({ email });

        // Controleer of de gebruiker bestaat
        if (!user) {
            return res.status(400).json({ msg: 'Ongeldige inloggegevens' });
        }

        // Controleer of het wachtwoord overeenkomt
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ msg: 'Ongeldige inloggegevens' });
        }

        // Inloggen gelukt
        const payload = {
            user: {
                id: user.id
            }
        };

        jwt.sign(payload, 'geheimetekenreeks', { expiresIn: 3600 }, (err, token) => {
            if (err) throw err;
            res.json({ token });
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Serverfout');
    }
});

module.exports = router;
