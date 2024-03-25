require('dotenv').config();

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const amqp = require('amqplib');
const gatewayToken = process.env.GATEWAY_TOKEN;
let channel = null;

async function connectToRabbitMQ() {
    try {
        const connection = await amqp.connect('amqp://localhost');
        channel = await connection.createChannel();

        const exchangeName = 'user_exchange';
        const queueName = 'user_queue';
        const routingKey = 'user.created';

        await channel.assertExchange(exchangeName, 'direct', { durable: true });
        await channel.assertQueue(queueName, { durable: true });
        await channel.bindQueue(queueName, exchangeName, routingKey);

        console.log('Verbonden met RabbitMQ');
    } catch (error) {
        console.error('Error connecting to RabbitMQ:', error);
    }
}

// Route voor het registreren van een nieuwe gebruiker
router.post('/register', verifyToken, async (req, res) => {
    try {
        const { username, email, password, role } = req.body;

        let user = await User.findOne({ email });
        if (user) {
            res.json({ msg: 'Gebruiker bestaat al' });
            return res.status(400);
        }

        user = new User({
            username,
            email,
            password,
            role
        });

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);

        await user.save();

        if (channel) {
            const exchangeName = 'user_exchange';
            const routingKey = 'user.created';
            const message = JSON.stringify(user);
            channel.publish(exchangeName, routingKey, Buffer.from(message), { persistent: true });
            console.log('User created message sent to RabbitMQ');
        } else {
            console.log('RabbitMQ channel is not available. Message not sent.');
        }

        res.json({ msg: 'Gebruiker succesvol geregistreerd' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Serverfout');
    }
});

// Middleware om te controleren of het verzoek via de gateway komt
function verifyToken(req, res, next) {
    const token = req.header('Gateway');

    if (!token || token !== gatewayToken) {
        console.log('Unauthorized access detected.');
        return res.status(401).json({ msg: 'Ongeautoriseerde toegang' });
    } else {
        console.log('Access granted.');
    }

    next();
}

connectToRabbitMQ();

module.exports = router;
