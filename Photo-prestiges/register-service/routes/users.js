const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const amqp = require('amqplib');

let channel = null; // Variabele om het kanaal voor RabbitMQ op te slaan

// Functie om een verbinding met RabbitMQ tot stand te brengen
async function connectToRabbitMQ() {
    try {
        const connection = await amqp.connect('amqp://localhost');
        channel = await connection.createChannel();

        const exchangeName = 'user_exchange';
        const queueName = 'user_queue';
        const routingKey = 'user.created';

        // Zorg ervoor dat de exchange en de queue duurzaam zijn
        await channel.assertExchange(exchangeName, 'direct', { durable: true });
        await channel.assertQueue(queueName, { durable: true });
        await channel.bindQueue(queueName, exchangeName, routingKey);

        console.log('Verbonden met RabbitMQ');
    } catch (error) {
        console.error('Error connecting to RabbitMQ:', error);
        // Hier kun je code toevoegen om te bufferen of berichten lokaal op te slaan
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

        // Verstuur een duurzaam bericht naar RabbitMQ
        if (channel) {
            const exchangeName = 'user_exchange';
            const routingKey = 'user.created';
            const message = JSON.stringify(user);
            channel.publish(exchangeName, routingKey, Buffer.from(message), { persistent: true });
            console.log('User created message sent to RabbitMQ');
        } else {
            console.log('RabbitMQ channel is not available. Message not sent.');
            // Hier kun je code toevoegen om te bufferen of berichten lokaal op te slaan
        }

        res.json({ msg: 'Gebruiker succesvol geregistreerd' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Serverfout');
    }
});

// Verbind met RabbitMQ bij het starten van de server
connectToRabbitMQ();

module.exports = router;
