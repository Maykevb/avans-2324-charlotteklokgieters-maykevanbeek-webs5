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
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const upload = multer();

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

        // Queue 2 for update contest
        const UpdateExchangeName = 'update_contest_exchange';
        const UpdateQueueName = 'update_contest_queue';
        const UpdateRoutingKey = 'contest.updated';

        await channel.assertExchange(exchangeName, 'direct', { durable: true });
        await channel.assertQueue(queueName, { durable: true });
        await channel.bindQueue(queueName, exchangeName, routingKey);

        console.log('Verbonden met RabbitMQ queue 1');

        // Queue 3 for submissions
        const SubmissionExchangeName = 'submission_exchange';
        const SubmissionQueueName = 'submission_queue';
        const SubmissionRoutingKey = 'submission.created';

        await channel.assertExchange(SubmissionExchangeName, 'direct', { durable: true });
        await channel.assertQueue(SubmissionQueueName, { durable: true });
        await channel.bindQueue(SubmissionQueueName, SubmissionExchangeName, SubmissionRoutingKey);

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
            const message = JSON.stringify(contest);
            channel.publish(exchangeName, routingKey, Buffer.from(message), { persistent: true });
            console.log('Contest created message sent to RabbitMQ');
        } else {
            console.log('RabbitMQ channel is not available. Message not sent');
        }

        res.json({ msg: 'Contest succesvol aangemaakt', contestId: contest._id });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Serverfout');
    }
});

router.post('/updateContest', verifyToken, upload.single('image'), async (req, res) => {
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

        if (!image || !image.buffer) {
            return res.status(400).json({ msg: 'Invalid image data' });
        }

        const imageBuffer = Buffer.from(image.buffer.data);
        const imageFileName = `${Date.now()}-${image.originalname.replaceAll(' ', '_')}`;
        const imagePath = path.join(__dirname, '../uploads', imageFileName);

        let imageUrl = null;
        fs.writeFile(imagePath, imageBuffer, (err) => {
            if (err) {
                console.error('Error saving image:', err);
                return res.status(500).send('Error saving image.');
            }
            imageUrl = `http://localhost:7000/uploads/${imageFileName}`;
        });

        let contest = await Contest.findById( new ObjectId(id) )

        if (imageUrl && contest.image) {
            const oldImagePath = path.join(__dirname, '../uploads', path.basename(contest.image));
            fs.unlinkSync(oldImagePath);
        }

        contest.place = place
        contest.image = imageUrl

        await contest.save();

        if (channel) {
            const exchangeName = 'contest_exchange';
            const routingKey = 'contest.updated';
            const message = JSON.stringify(contest);
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
            const message = JSON.stringify(submission);
            channel.publish(exchangeName, routingKey, Buffer.from(message), { persistent: true });
            console.log('Submission created message sent to RabbitMQ');
        } else {
            console.log('RabbitMQ channel is not available. Message not sent');
        }

        res.json({ msg: 'Gebruiker succesvol aangemeld bij wedstrijd', submissionId: submission._id });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Serverfout');
    }
});

router.post('/updateSubmission', verifyToken, upload.single('image'), async (req, res) => {
    try {
        const { submissionId, image } = req.body;
        let username = req.body.user

        let user = await User.findOne({ username });
        if (!user) {
            return res.status(400).json({ msg: 'Gebruiker bestaat niet' });
        }

        if (user.role !== 'participant') {
            return res.status(401).json({msg: 'Je hebt niet de juiste rechten om een submission te updaten'})
        }

        if (!image || !image.buffer) {
            return res.status(400).json({ msg: 'Invalid image data' });
        }

        const imageBuffer = Buffer.from(image.buffer.data);
        const imageFileName = `${Date.now()}-${image.originalname.replaceAll(' ', '_')}`;
        const imagePath = path.join(__dirname, '../uploads', imageFileName);

        let imageUrl = null;
        fs.writeFile(imagePath, imageBuffer, (err) => {
            if (err) {
                console.error('Error saving image:', err);
                return res.status(500).send('Error saving image.');
            }
            imageUrl = `http://localhost:7000/uploads/${imageFileName}`;
        });

        let submission = await Submission.findById( new ObjectId(submissionId) )

        if (imageUrl && submission.image) {
            const oldImagePath = path.join(__dirname, '../uploads', path.basename(submission.image));
            fs.unlinkSync(oldImagePath);
        }

        submission.image = imageUrl

        await submission.save();

        if (channel) {
            const exchangeName = 'submission_exchange';
            const routingKey = 'submission.updated';
            const message = JSON.stringify(submission);
            channel.publish(exchangeName, routingKey, Buffer.from(message), { persistent: true });
            console.log('Submission updated message sent to RabbitMQ');
        } else {
            console.log('RabbitMQ channel is not available. Message not sent');
        }

        res.json({ msg: 'Submission succesvol geupdate' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Serverfout');
    }
})

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
