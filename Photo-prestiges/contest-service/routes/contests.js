require('dotenv').config();

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Contest = require('../models/Contest');
const amqp = require('amqplib');
const gatewayToken = process.env.GATEWAY_TOKEN;
let channel = null;

async function connectToRabbitMQ() {
    try {
        const connection = await amqp.connect('amqp://localhost');
        channel = await connection.createChannel();

        const exchangeName = 'contest_exchange';
        const queueName = 'contest_queue';
        const routingKey = 'contest.created';

        await channel.assertExchange(exchangeName, 'direct', { durable: true });
        await channel.assertQueue(queueName, { durable: true });
        await channel.bindQueue(queueName, exchangeName, routingKey);

        console.log('Verbonden met RabbitMQ producer');
    } catch (error) {
        console.error('Error connecting to RabbitMQ:', error);
    }
}

// Route voor het aanmaken van een nieuwe wedstrijd
router.post('/create', verifyToken, async (req, res) => {
    try {
        const { description, place, endTime } = req.body;
        let username = req.body.user

        let user = await User.findOne({ username });
        if (!user) {
            return res.status(400).json({ msg: 'Gebruiker bestaat niet' });
        }

        if(user.role !== 'targetOwner') {
            return res.status(401).json({msg: 'Je hebt niet de juiste rechten om een wedstrijd aan te maken'})
        }

        let contest = new Contest({
            owner: user,
            description,
            place,
            endTime
        });

        await contest.save();

        if (channel) {
            const exchangeName = 'contest_exchange';
            const routingKey = 'contest.created';
            const message = JSON.stringify(user);
            channel.publish(exchangeName, routingKey, Buffer.from(message), { persistent: true });
            console.log('Contest created message sent to RabbitMQ');
        } else {
            console.log('RabbitMQ channel is not available. Message not sent.');
        }

        res.json({ msg: 'Contest succesvol geregistreerd' });
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
