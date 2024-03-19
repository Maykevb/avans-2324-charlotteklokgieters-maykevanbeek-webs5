const amqp = require('amqplib');
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');

// Functie om een verbinding met RabbitMQ tot stand te brengen
async function connectToRabbitMQ() {
    try {
        const connection = await amqp.connect('amqp://localhost');
        const channel = await connection.createChannel();
        return channel;
    } catch (error) {
        console.error('Error connecting to RabbitMQ:', error);
    }
}

// Route voor het registreren van een nieuwe gebruiker
router.post('/register', async (req, res) => {
    try {
        const { username, email, password, role } = req.body;

        // Controleer of de gebruiker al bestaat
        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ msg: 'Gebruiker bestaat al' });
        }

        // Maak een nieuwe gebruiker aan
        user = new User({
            username,
            email,
            password,
            role
        });

        // Hash het wachtwoord
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);

        // Sla de gebruiker op in de database
        await user.save();

        // Verstuur een bericht naar RabbitMQ
        const channel = await connectToRabbitMQ();
        const exchangeName = 'user_exchange';
        const routingKey = 'user.created';
        const message = JSON.stringify(user);
        channel.publish(exchangeName, routingKey, Buffer.from(message));
        console.log('User created message sent to RabbitMQ');

        res.json({ msg: 'Gebruiker succesvol geregistreerd' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Serverfout');
    }
});

module.exports = router;
