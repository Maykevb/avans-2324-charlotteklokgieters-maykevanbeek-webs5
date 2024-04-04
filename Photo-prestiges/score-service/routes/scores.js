require('dotenv').config({ path: '../.env' })

const express = require('express');
const router = express.Router();
let channel = null;
const Submission = require('../models/Submission');
const Contest = require('../models/Contest');
const mongoose = require("mongoose");
const ObjectId = mongoose.Types.ObjectId;
const axios = require('axios');
const amqp = require('amqplib');
const fs = require('fs');
const FormData = require('form-data');
const gatewayToken = process.env.GATEWAY_TOKEN
const amqp_url = process.env.AMQPURL;

async function connectToRabbitMQ() {
    try {
        const connection = await amqp.connect(amqp_url);
        channel = await connection.createChannel();

        // Queue for update submissions
        const SubmissionUpdateExchangeName = 'submission_score_exchange';
        const SubmissionUpdateQueueName = 'submission_score_update_queue';
        const SubmissionUpdateRoutingKey = 'submission.scoreUpdated';

        await channel.assertExchange(SubmissionUpdateExchangeName, 'direct', { durable: true });
        await channel.assertQueue(SubmissionUpdateQueueName, { durable: true });
        await channel.bindQueue(SubmissionUpdateQueueName, SubmissionUpdateExchangeName, SubmissionUpdateRoutingKey);

        console.log('Connected to RabbitMQ queue');
    } catch (error) {
        console.error('Error connecting to RabbitMQ:', error);
    }
}

router.put('/update-score', verifyToken, async (req, res) => {
    try {
        const { submissionId } = req.body;

        let submission = await Submission.findById( new ObjectId(submissionId) )
        if (!submission) {
            return res.status(400).json({ msg: 'Submission not found.' });
        }

        let contest = await Contest.findById(submission.contest)
        if (!contest) {
            return res.status(400).json({ msg: 'Contest not found.' });
        }

        if (submission.image && contest.image) {
            const subImageUrl = submission.image;
            const conImageUrl = contest.image;

            // Scores[0] will be submission scores, scores[1] will be contest scores
            let urls = [subImageUrl, conImageUrl];
            let scores = [];

            for (const url of urls) {
                const parts = url.split('/uploads/');
                const uploadsPart = parts[1];

                const filePath = '../contest-service/uploads/' + uploadsPart;
                const formData = new FormData();
                formData.append('image', fs.createReadStream(filePath));

                await (async () => {
                    try {
                        const response = await axios.post('https://api.imagga.com/v2/tags', formData, {
                            auth: {
                                username: process.env.IMAGGA_API_KEY,
                                password: process.env.IMAGGA_API_SECRET
                            }
                        });
                        scores.push(response.data.result);
                    } catch (error) {
                        console.log(error);
                    }
                })();
            }

            const filteredTagsSubmission = scores[0].tags.filter(tag => tag.confidence >= 30);
            const filteredTagsContest = scores[1].tags.filter(tag => tag.confidence >= 30);

            let matchingConfidenceSum = 0;
            let matchingTags = 0;

            for (const tagSubmission of filteredTagsSubmission) {
                for (const tagContest of filteredTagsContest) {
                    if (tagSubmission.tag.en === tagContest.tag.en) {
                        matchingTags++;
                        matchingConfidenceSum += Math.abs(tagSubmission.confidence - tagContest.confidence);
                        break;
                    }
                }
            }

            let percentageMatch;
            if (matchingTags === 0) {
                percentageMatch = 0;
            } else {
                const averageMatchingConfidenceDifference = matchingConfidenceSum / matchingTags;
                percentageMatch = ((matchingTags / Math.max(filteredTagsSubmission.length, filteredTagsContest.length)) * (1 - averageMatchingConfidenceDifference / 100)) * 100;
            }

            if (percentageMatch === 100) {
                return res.status(400).json({ msg: 'You are not allowed to upload the same image as the target image, cheater >:(' });
            }

            const currentTime = new Date().getTime();
            const timeDifferenceStart = Math.abs(contest.startTime - currentTime);
            const timeScore = Math.max(0, Math.min(1, 1 - timeDifferenceStart / (contest.endTime - contest.startTime))) * 100;

            // How close the image is will be 90% of the end score, the other 10% is based on how quick the submission was sent in
            const totalScore = 0.9 * percentageMatch + 0.1 * timeScore;
            const roundedTotal = parseFloat(totalScore.toFixed(2));

            submission.score = roundedTotal
            await submission.save();

            if (channel) {
                const exchangeName = 'submission_score_exchange';
                const routingKey = 'submission.scoreUpdated';
                const message = JSON.stringify(submission);
                channel.publish(exchangeName, routingKey, Buffer.from(message), { persistent: true });
                console.log('Submission updated message sent to RabbitMQ');
            } else {
                console.log('RabbitMQ channel is not available. Message not sent');
            }

            res.json({ msg: 'Submission successfully updated'});
        } else {
            return res.status(400).json({ msg: 'Contest of submission does not have a target image yet' });
        }
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