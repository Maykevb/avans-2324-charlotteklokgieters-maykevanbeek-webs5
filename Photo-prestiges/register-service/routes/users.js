require('dotenv').config({ path: '../.env' })

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const amqp = require('amqplib');
const gatewayToken = process.env.GATEWAY_TOKEN;
let channel = null;
const amqp_url = process.env.AMQPURL;

async function connectToRabbitMQ() {
    try {
        const connection = await amqp.connect(amqp_url);
        channel = await connection.createChannel();

        const exchangeName = 'user_exchange';
        const queueName = 'user_created_queue';
        const routingKey = 'user.created';

        await channel.assertExchange(exchangeName, 'direct', { durable: true });
        await channel.assertQueue(queueName, { durable: true });
        await channel.bindQueue(queueName, exchangeName, routingKey);

        console.log('Connected to RabbitMQ');
    } catch (error) {
        console.error('Error connecting to RabbitMQ:', error);
    }
}

// Route for registering a new user
router.post('/register', verifyToken, async (req, res) => {
    try {
        const { username, email, password, role } = req.body;

        let user = await User.findOne({ username });
        if (user) {
            return res.status(400).json({ msg: 'User already exists.' });
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

        res.json({ msg: 'User successfully registered' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
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

connectToRabbitMQ();

module.exports = router;
