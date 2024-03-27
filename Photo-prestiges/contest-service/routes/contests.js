require('dotenv').config();

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Contest = require('../models/Contest');
const Submission = require('../models/Submission');
const amqp = require('amqplib');
const mongoose = require("mongoose");
const gatewayToken = process.env.GATEWAY_TOKEN;
let channel = null;
const ObjectId = mongoose.Types.ObjectId;

async function connectToRabbitMQ() {
    try {
        const connection = await amqp.connect('amqp://localhost');
        channel = await connection.createChannel();

        // Queue 1 for contests
        const exchangeName = 'contest_exchange';
        const queueName = 'contest_queue';
        const routingKey = 'contest.created';

        await channel.assertExchange(exchangeName, 'direct', { durable: true });
        await channel.assertQueue(queueName, { durable: true });
        await channel.bindQueue(queueName, exchangeName, routingKey);

        console.log('Verbonden met RabbitMQ queue 1');

        // Queue 2 for submissions
        const otherExchangeName = 'submission_exchange';
        const otherQueueName = 'submission_queue';
        const otherRoutingKey = 'submission.created';

        await channel.assertExchange(otherExchangeName, 'direct', { durable: true });
        await channel.assertQueue(otherQueueName, { durable: true });
        await channel.bindQueue(otherQueueName, otherExchangeName, otherRoutingKey);

        console.log('Verbonden met RabbitMQ queue 2');
    } catch (error) {
        console.error('Error connecting to RabbitMQ:', error);
    }
}

// Route voor het aanmaken van een nieuwe wedstrijd
router.post('/create', verifyToken, async (req, res) => {
    try {
        const { description, endTime } = req.body;
        let username = req.body.user

        let user = await User.findOne({ username });
        if (!user) {
            return res.status(400).json({ msg: 'Gebruiker bestaat niet' });
        }

        if (user.role !== 'targetOwner') {
            return res.status(401).json({msg: 'Je hebt niet de juiste rechten om een wedstrijd aan te maken'})
        }

        let contest = new Contest({
            owner: user,
            description,
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
            console.log('RabbitMQ channel is not available. Message not sent');
        }

        res.json({ msg: 'Contest succesvol aangemaakt' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Serverfout');
    }
});

router.post('/update', verifyToken, async (req, res) => {
    try {
        const { id, place, image } = req.body;
        let username = req.body.user

        let user = await User.findOne({ username });
        if (!user) {
            return res.status(400).json({ msg: 'Gebruiker bestaat niet' });
        }

        if (user.role !== 'targetOwner') {
            return res.status(401).json({msg: 'Je hebt niet de juiste rechten om een wedstrijd te updaten'})
        }

        let contest = await Contest.findById( new ObjectId(id) )
        contest.place = place
        contest.image = image

        await contest.save();

        if (channel) {
            const exchangeName = 'contest_exchange';
            const routingKey = 'contest.updated';
            const message = JSON.stringify(user);
            channel.publish(exchangeName, routingKey, Buffer.from(message), { persistent: true });
            console.log('Contest updated message sent to RabbitMQ');
        } else {
            console.log('RabbitMQ channel is not available. Message not sent.');
        }

        res.json({ msg: 'Contest succesvol geupdate' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Serverfout');
    }
});

router.post('/register', verifyToken, async (req, res) => {
    try {
        const { contestId } = req.body;
        let username = req.body.user

        let user = await User.findOne({ username });
        if (!user) {
            return res.status(400).json({ msg: 'Gebruiker bestaat niet' });
        }

        if(user.role !== 'participant') {
            return res.status(401).json({ msg: 'Je hebt niet de juiste rechten om je in te schrijven voor een wedstrijd' });
        }

        let contest = await Contest.findById(contestId);
        if(!contest) {
            return res.status(400).json({ msg: 'Er bestaat geen wedstrijd met deze ID'})
        }

        const existingSubmission = await Submission.findOne({ contest: contestId, participant: user._id });
        if (existingSubmission) {
            return res.status(400).json({ msg: 'Je hebt al deelgenomen aan deze wedstrijd' });
        }

        let submission = new Submission({
            contest: contest,
            participant: user
        })

        await submission.save();

        if (channel) {
            const exchangeName = 'submission_exchange';
            const routingKey = 'submission.created';
            const message = JSON.stringify(user);
            channel.publish(exchangeName, routingKey, Buffer.from(message), { persistent: true });
            console.log('Submission created message sent to RabbitMQ');
        } else {
            console.log('RabbitMQ channel is not available. Message not sent');
        }

        res.json({ msg: 'Gebruiker succesvol aangemeld bij wedstrijd' });
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
