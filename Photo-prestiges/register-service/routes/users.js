require('dotenv').config();

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const amqp = require('amqplib');
const axios = require('axios');
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

        // Call mail service to send confirmation email
        await sendConfirmationEmail(email, username, password);

        res.json({ msg: 'Gebruiker succesvol geregistreerd' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Serverfout');
    }
});

// Function to call mail service for sending confirmation email
async function sendConfirmationEmail(email, username, password) {
    try {
        // Make a POST request to the mail service endpoint
        await axios.post('http://localhost:6000/confirmation/registration', { username, email, password });
        console.log('Confirmation email request sent to mail service');
    } catch (error) {
        console.error('Error sending confirmation email request to mail service:', error);
        throw new Error('Failed to send confirmation email request');
    }
}


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
