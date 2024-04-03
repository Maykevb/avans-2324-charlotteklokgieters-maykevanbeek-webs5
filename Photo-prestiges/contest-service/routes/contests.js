require('dotenv').config({ path: '../.env' })

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
        const queueName = 'contest_created_queue';
        const routingKey = 'contest.created';

        await channel.assertExchange(exchangeName, 'direct', { durable: true });
        await channel.assertQueue(queueName, { durable: true });
        await channel.bindQueue(queueName, exchangeName, routingKey);

        console.log('Verbonden met RabbitMQ queue 1');

        // Queue 2 for update contest
        const UpdateExchangeName = 'update_contest_exchange';
        const UpdateQueueName = 'update_contest_queue';
        const UpdateRoutingKey = 'contest.updated';

        await channel.assertExchange(UpdateExchangeName, 'direct', { durable: true });
        await channel.assertQueue(UpdateQueueName, { durable: true });
        await channel.bindQueue(UpdateQueueName, UpdateExchangeName, UpdateRoutingKey);

        console.log('Verbonden met RabbitMQ queue 2');

        // Queue 3 for submissions
        const SubmissionExchangeName = 'submission_exchange';
        const SubmissionQueueName = 'submission_created_queue';
        const SubmissionRoutingKey = 'submission.created';

        await channel.assertExchange(SubmissionExchangeName, 'direct', { durable: true });
        await channel.assertQueue(SubmissionQueueName, { durable: true });
        await channel.bindQueue(SubmissionQueueName, SubmissionExchangeName, SubmissionRoutingKey);

        console.log('Verbonden met RabbitMQ queue 3');

        // Queue 4 for update submission
        const SubmissionUpdateExchangeName = 'update_submission_exchange';
        const SubmissionUpdateQueueName = 'update_submission_queue';
        const SubmissionUpdateRoutingKey = 'submission.updated';

        await channel.assertExchange(SubmissionUpdateExchangeName, 'direct', { durable: true });
        await channel.assertQueue(SubmissionUpdateQueueName, { durable: true });
        await channel.bindQueue(SubmissionUpdateQueueName, SubmissionUpdateExchangeName, SubmissionUpdateRoutingKey);

        console.log('Verbonden met RabbitMQ queue 4');

        // Queue 5 for delete contest
        const ContestDeleteExchangeName = 'contest_delete_exchange';
        const ContestDeleteQueueName = 'contest_delete_queue';
        const ContestDeleteRoutingKey = 'contest.deleted';

        await channel.assertExchange(ContestDeleteExchangeName, 'direct', { durable: true });
        await channel.assertQueue(ContestDeleteQueueName, { durable: true });
        await channel.bindQueue(ContestDeleteQueueName, ContestDeleteExchangeName, ContestDeleteRoutingKey);

        console.log('Verbonden met RabbitMQ queue 5');

        // Queue 6 for delete submission
        const SubmissionDeleteExchangeName = 'submission_deleted_exchange';
        const SubmissionDeleteQueueName = 'submission_deleted_queue';
        const SubmissionDeleteRoutingKey = 'submission.deleted';

        await channel.assertExchange(SubmissionDeleteExchangeName, 'direct', { durable: true });
        await channel.assertQueue(SubmissionDeleteQueueName, { durable: true });
        await channel.bindQueue(SubmissionDeleteQueueName, SubmissionDeleteExchangeName, SubmissionDeleteRoutingKey);

        console.log('Verbonden met RabbitMQ queue 6');

        // Queue 7 for update contest
        const ContestVoteExchangeName = 'contest_voting_exchange';
        const ContestVoteQueueName = 'update_contest_votes_queue';
        const ContestVoteRoutingKey = 'contest.votesUpdated';

        await channel.assertExchange(ContestVoteExchangeName, 'direct', { durable: true });
        await channel.assertQueue(ContestVoteQueueName, { durable: true });
        await channel.bindQueue(ContestVoteQueueName, ContestVoteExchangeName, ContestVoteRoutingKey);

        console.log('Verbonden met RabbitMQ queue 7');
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

        const oneHourInMillis = 60 * 60 * 1000; // 1 uur in milliseconden
        const twoYearsInMillis = 2 * 365 * 24 * 60 * 60 * 1000; // 2 jaar in milliseconden

        // Huidige tijd in UTC
        const currentUTCMillis = new Date().getTime();

        const minEndTime = currentUTCMillis + oneHourInMillis;
        const maxEndTime = currentUTCMillis + twoYearsInMillis;

        const endTimeMillis = new Date(endTime).getTime();

        if (endTimeMillis < minEndTime || endTimeMillis > maxEndTime) {
            return res.status(400).json({
                msg: 'Onjuiste endTime, endTime moet minimaal 1 uur in de toekomst en maximaal 2 jaar in de toekomst zijn.'
            });
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

router.put('/updateContest', verifyToken, upload.single('image'), async (req, res) => {
    try {
        const { id, place, image } = req.body;
        let username = req.body.user

        let contest = await Contest.findById( new ObjectId(id) )
        let user = await User.findOne({ username });

        if (!user) {
            return res.status(400).json({ msg: 'Gebruiker bestaat niet' });
        }

        if (!contest) {
            return res.status(400).json({ msg: 'Wedstrijd bestaat niet' });
        }

        let owner = await User.findById(contest.owner)
        if (user.role !== 'targetOwner' || user.username !== owner.username) {
            return res.status(401).json({msg: 'Je hebt niet de juiste rechten om deze wedstrijd te updaten'})
        }

        if (!image || !image.buffer) {
            return res.status(400).json({ msg: 'Invalid image data' });
        }

        const imageBuffer = Buffer.from(image.buffer.data);
        const imageFileName = `${Date.now()}-${image.originalname.replaceAll(' ', '_')}`;
        const imagePath = path.join(__dirname, '../uploads', imageFileName);

        let imageUrl = `http://localhost:7000/uploads/${imageFileName}`;
        fs.writeFile(imagePath, imageBuffer, (err) => {
            if (err) {
                console.error('Error saving image:', err);
                return res.status(500).send('Error saving image.');
            }
        });

        if (imageUrl && contest.image) {
            const oldImagePath = path.join(__dirname, '../uploads', path.basename(contest.image));
            fs.unlinkSync(oldImagePath);
        }

        contest.place = place
        contest.image = imageUrl

        await contest.save();

        if (channel) {
            const exchangeName = 'update_contest_exchange';
            const routingKey = 'contest.updated';
            const message = JSON.stringify(contest);
            channel.publish(exchangeName, routingKey, Buffer.from(message), { persistent: true });
            console.log('Contest updated message sent to RabbitMQ');
        } else {
            console.log('RabbitMQ channel is not available. Message not sent.');
        }

        res.json({ msg: 'Contest succesvol geüpdate' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Serverfout');
    }
});

router.delete('/deleteContest', verifyToken, async (req, res) => {
    try {
        const { contestId } = req.body;
        let username = req.body.user

        const contest = await Contest.findById(new ObjectId(contestId));
        let user = await User.findOne({ username })

        if (!contest) {
            return res.status(404).json({ msg: 'Wedstrijd niet gevonden' });
        }

        if (!user) {
            return res.status(400).json({ msg: 'Gebruiker bestaat niet' });
        }

        let owner = await User.findById(contest.owner)
        if (user.username !== owner.username) {
            return res.status(401).json({ msg: 'Je hebt niet de juiste rechten om deze wedstrijd te verwijderen' });
        }

        if (contest.image) {
            const oldImagePath = path.join(__dirname, '../uploads', path.basename(contest.image));
            fs.unlinkSync(oldImagePath);
        }

        await Submission.deleteMany({ contest: contest });
        await Contest.deleteOne({ _id: contestId });

        if (channel) {
            const exchangeName = 'contest_delete_exchange';
            const routingKey = 'contest.deleted';
            const message = JSON.stringify(contest);
            channel.publish(exchangeName, routingKey, Buffer.from(message), { persistent: true });
            console.log('Contest deleted message sent to RabbitMQ');
        } else {
            console.log('RabbitMQ channel is not available. Message not sent');
        }

        res.json({ msg: 'Contest succesvol verwijderd' });
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

router.put('/updateSubmission', verifyToken, upload.single('image'), async (req, res) => {
    try {
        const { submissionId, image } = req.body;
        let username = req.body.user

        let submission = await Submission.findById( new ObjectId(submissionId) )
        let user = await User.findOne({ username });

        if (!user) {
            return res.status(400).json({ msg: 'Gebruiker bestaat niet' });
        }

        if (!submission) {
            return res.status(404).json({ msg: 'Submission niet gevonden' });
        }

        let participant = await User.findById(submission.participant)
        if (user.role !== 'participant' || user.username !== participant.username) {
            return res.status(401).json({msg: 'Je hebt niet de juiste rechten om deze submission te updaten'})
        }

        if (!image || !image.buffer) {
            return res.status(400).json({ msg: 'Invalid image data' });
        }

        const imageBuffer = Buffer.from(image.buffer.data);
        const imageFileName = `${Date.now()}-${image.originalname.replaceAll(' ', '_')}`;
        const imagePath = path.join(__dirname, '../uploads', imageFileName);

        let imageUrl = `http://localhost:7000/uploads/${imageFileName}`;
        fs.writeFile(imagePath, imageBuffer, (err) => {
            if (err) {
                console.error('Error saving image:', err);
                return res.status(500).send('Error saving image.');
            }
        });

        if (imageUrl && submission.image) {
            const oldImagePath = path.join(__dirname, '../uploads', path.basename(submission.image));
            fs.unlinkSync(oldImagePath);
        }

        submission.image = imageUrl

        await submission.save();

        if (channel) {
            const exchangeName = 'update_submission_exchange';
            const routingKey = 'submission.updated';
            const message = JSON.stringify(submission);
            channel.publish(exchangeName, routingKey, Buffer.from(message), { persistent: true });
            console.log('Submission updated message sent to RabbitMQ');
        } else {
            console.log('RabbitMQ channel is not available. Message not sent');
        }

        res.json({ msg: 'Submission succesvol geüpdate' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Serverfout');
    }
})

router.delete('/deleteSubmission', verifyToken, async (req, res) => {
    try {
        const { submissionId } = req.body;
        let username = req.body.user

        let submission = await Submission.findById( new ObjectId(submissionId) )
        let user = await User.findOne({ username });

        if (!user) {
            return res.status(400).json({ msg: 'Gebruiker bestaat niet' });
        }

        if (!submission) {
            return res.status(404).json({ msg: 'Submission niet gevonden' });
        }

        let participant = await User.findById(submission.participant)
        if (user.role !== 'participant' || user.username !== participant.username) {
            return res.status(401).json({msg: 'Je hebt niet de juiste rechten om deze submission te verwijderen'})
        }

        if (submission.image) {
            const oldImagePath = path.join(__dirname, '../uploads', path.basename(submission.image));
            fs.unlinkSync(oldImagePath);
        }

        await Submission.deleteOne({ _id: submissionId });

        if (channel) {
            const exchangeName = 'submission_deleted_exchange';
            const routingKey = 'submission.deleted';
            const message = JSON.stringify(submission);
            channel.publish(exchangeName, routingKey, Buffer.from(message), { persistent: true });
            console.log('Submission deleted message sent to RabbitMQ');
        } else {
            console.log('RabbitMQ channel is not available. Message not sent');
        }

        res.json({ msg: 'Submission succesvol verwijderd' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Serverfout');
    }
});

router.delete('/deleteSubmissionAsOwner', verifyToken, async (req, res) => {
    try {
        const { submissionId } = req.body;
        let username = req.body.user

        let submission = await Submission.findById( new ObjectId(submissionId) )
        let user = await User.findOne({ username });

        if (!user) {
            return res.status(400).json({ msg: 'User not found.' });
        }

        if (!submission) {
            return res.status(404).json({ msg: 'Submission not found.' });
        }

        let contest = await Contest.findById(submission.contest)
        if (!contest) {
            return res.status(404).json({ msg: 'Contest not found.' });
        }

        let owner = await User.findById(contest.owner)
        if (!owner) {
            return res.status(404).json({ msg: 'Contest owner not found.' });
        }

        if (user.role !== 'targetOwner' || user.username !== owner.username) {
            return res.status(401).json({msg: 'Je hebt niet de juiste rechten om deze submission te verwijderen'})
        }

        if (submission.image) {
            const oldImagePath = path.join(__dirname, '../uploads', path.basename(submission.image));
            fs.unlinkSync(oldImagePath);
        }

        await Submission.deleteOne({ _id: submissionId });

        if (channel) {
            const exchangeName = 'submission_deleted_exchange';
            const routingKey = 'submission.deleted';
            const message = JSON.stringify(submission);
            channel.publish(exchangeName, routingKey, Buffer.from(message), { persistent: true });
            console.log('Submission deleted message sent to RabbitMQ');
        } else {
            console.log('RabbitMQ channel is not available. Message not sent');
        }

        res.json({ msg: 'Submission succesvol verwijderd' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Serverfout');
    }
});

router.put('/vote', verifyToken, async (req, res) => {
    try {
        const { contestId, thumbsUp } = req.body;
        let username = req.body.user

        let user = await User.findOne({ username });
        if (!user) {
            return res.status(400).json({ msg: 'Gebruiker bestaat niet' });
        }

        if (user.role !== 'participant') {
            return res.status(401).json({ msg: 'Je hebt niet de juiste rechten om je in te schrijven voor een wedstrijd' });
        }

        let contest = await Contest.findById(contestId);
        if(!contest) {
            return res.status(400).json({ msg: 'Er bestaat geen wedstrijd met deze ID'})
        }

        const existingSubmission = await Submission.findOne({ contest: contestId, participant: user._id });
        if (!existingSubmission) {
            return res.status(400).json({ msg: 'Je doet momenteel niet mee aan deze wedstrijd' });
        }

        if (thumbsUp) {
            contest.thumbsUp = contest.thumbsUp + 1
        } else {
            contest.thumbsDown = contest.thumbsDown + 1
        }

        await contest.save();

        if (channel) {
            const exchangeName = 'contest_voting_exchange';
            const routingKey = 'contest.votesUpdated';
            const message = JSON.stringify(contest);
            channel.publish(exchangeName, routingKey, Buffer.from(message), { persistent: true });
            console.log('Voted on contest message sent to RabbitMQ');
        } else {
            console.log('RabbitMQ channel is not available. Message not sent');
        }

        res.json({ msg: 'Succesvol voor wedstijd gestemd' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Serverfout');
    }
});

router.get('/getSubmission', verifyToken, async (req, res) => {
    try {
        const { submissionId } = req.query;
        let username = req.body.user

        const submission = await Submission.findById(submissionId);
        if (!submission) {
            return res.status(404).json({ msg: 'Submission not found.' });
        }

        const user = await User.findById({ _id: submission.participant });
        if (!user || username !== user.username ) {
            return res.status(404).json({ msg: 'Invalid user.' });
        }

        res.json(submission);
    } catch (error) {
        console.error('Fout bij het ophalen van submission:', error);
        res.status(500).json({ msg: 'Serverfout bij het ophalen van submission' });
    }
});

router.get('/getAllSubmissions', verifyToken, async (req, res) => {
    try {
        const { contestId, page = 1, limit = 10 } = req.query;
        let username = req.body.user

        const contest = await Contest.findById(contestId);
        if (!contest) {
            return res.status(404).json({ msg: 'Contest not found.' });
        }

        const user = await User.findById({ _id: contest.owner });
        if (!user || username !== user.username ) {
            return res.status(404).json({ msg: 'Invalid user.' });
        }

        const submissions = await Submission.find({ contest: contestId })
            .skip((page - 1) * limit)
            .limit(limit);

        res.json(submissions);
    } catch (error) {
        console.error('Fout bij het ophalen van alle submissions:', error);
        res.status(500).json({ msg: 'Serverfout bij het ophalen van submissions' });
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
