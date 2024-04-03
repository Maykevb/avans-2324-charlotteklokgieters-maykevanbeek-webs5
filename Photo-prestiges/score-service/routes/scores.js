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

async function connectToRabbitMQ() {
    try {
        const connection = await amqp.connect('amqp://localhost');
        channel = await connection.createChannel();

        // Queue for update submissions
        const SubmissionUpdateExchangeName = 'submission_score_exchange';
        const SubmissionUpdateQueueName = 'submission_score_update_queue';
        const SubmissionUpdateRoutingKey = 'submission.scoreUpdated';

        await channel.assertExchange(SubmissionUpdateExchangeName, 'direct', { durable: true });
        await channel.assertQueue(SubmissionUpdateQueueName, { durable: true });
        await channel.bindQueue(SubmissionUpdateQueueName, SubmissionUpdateExchangeName, SubmissionUpdateRoutingKey);

        console.log('Verbonden met RabbitMQ queue');
    } catch (error) {
        console.error('Error connecting to RabbitMQ:', error);
    }
}

router.put('/update-score', async (req, res) => {
    try {
        const { submissionId } = req.body;

        let submission = await Submission.findById( new ObjectId(submissionId) )
        if (!submission) {
            return res.status(404).json({ msg: 'Submission niet gevonden' });
        }

        let contest = await Contest.findById(submission.contest)
        if (!contest) {
            return res.status(403).json({ msg: 'Contest niet gevonden' });
        }

        if (submission.image && contest.image) {
            const subImageUrl = submission.image;
            const conImageUrl = contest.image;

            // scores[0] will be submission scores, scores[1] will be contest scores
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
                return res.status(404).json({ msg: 'Je mag niet hetzelde plaatje uploaden als de target image, valsspeler >:(' });
            }

            const roundedPercentageMatch = parseFloat(percentageMatch.toFixed(2));
            submission.score = roundedPercentageMatch
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

            res.json({ msg: 'Submission succesvol geüpdate'});
        } else {
            return res.status(400).json({ msg: 'Contest of submission heeft npg geen target image' });
        }
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Serverfout');
    }
});

connectToRabbitMQ();

module.exports = router;