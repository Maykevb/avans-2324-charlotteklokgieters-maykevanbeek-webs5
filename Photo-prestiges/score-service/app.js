require('dotenv').config({ path: '../.env' })

const express = require('express');
const app = express();
const scoresRoutes = require('./routes/scores.js');
const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;
const amqp = require('amqplib');
const Submission = require('./models/Submission');
const Contest = require('./models/Contest');
const axios = require('axios');
const gatewayToken = process.env.GATEWAY_TOKEN
const amqp_url = process.env.AMQPURL;

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use('/scores', scoresRoutes);

// MongoDB-connection
mongoose.connect('mongodb://localhost:27017/score-service')
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.log(err));

// RabbitMQ-connection
async function connectToRabbitMQCreateSubmission() {
    try {
        const connection = await amqp.connect(amqp_url);
        const channel = await connection.createChannel();
        const exchangeName = 'submission_exchange';
        const queueName = 'score_submission_created_queue';

        // Connect the queue with the exchange and routing key
        await channel.assertExchange(exchangeName, 'direct', { durable: true });
        await channel.assertQueue(queueName, { durable: true });
        await channel.bindQueue(queueName, exchangeName, 'submission.created');

        channel.consume(queueName, async (message) => {
            if (message) {
                try {
                    const submission = JSON.parse(message.content.toString());
                    console.log('Received submission:', submission);

                    const newSubmission = new Submission({
                        _id: submission._id,
                        contest: submission.contest,
                        participant: submission.participant,
                        image: submission.image,
                        score: submission.score
                    });

                    await newSubmission.save();

                    console.log('Submission saved to database:', newSubmission);
                } catch (error) {
                    console.error('Error while trying to process the message:', error);
                }
            }
        }, { noAck: true });

        console.log('Connected to RabbitMQ');
    } catch (error) {
        console.error('Error while trying to connect to RabbitMQ:', error);
    }
}

async function connectToRabbitMQUpdateSubmission() {
    try {
        const connection = await amqp.connect(amqp_url);
        const channel = await connection.createChannel();
        const exchangeName = 'update_submission_exchange';
        const queueName = 'score_service_submission_update_queue';

        // Connect the queue with the exchange and routing key
        await channel.assertExchange(exchangeName, 'direct', { durable: true });
        await channel.assertQueue(queueName, { durable: true });
        await channel.bindQueue(queueName, exchangeName, 'submission.updated');

        channel.consume(queueName, async (message) => {
            if (message) {
                try {
                    const submission = JSON.parse(message.content.toString());
                    console.log('Received submission:', submission);

                    const existingSubmission = await Submission.findById( new ObjectId(submission._id) )
                    if (!existingSubmission) {
                        console.error('Submission not found.');
                        return;
                    }

                    if (submission.image) {
                        existingSubmission.image = submission.image;
                    }

                    await existingSubmission.save();
                    await updateSubmissionScore(submission._id);
                } catch (error) {
                    console.error('Error while saving the submission:', error);
                }
            }
        }, { noAck: true });

        console.log('Connected to RabbitMQ');
    } catch (error) {
        console.error('Error while trying to connect to RabbitMQ:', error);
    }
}

async function connectAndProcessContestUpdate() {
    try {
        const connection = await amqp.connect(amqp_url);
        const channel = await connection.createChannel();
        const updateExchangeName = 'update_contest_exchange';
        const updateQueueName = 'score_update_contest_queue';

        await channel.assertExchange(updateExchangeName, 'direct', { durable: true });
        await channel.assertQueue(updateQueueName, { durable: true });
        await channel.bindQueue(updateQueueName, updateExchangeName, 'contest.updated');

        channel.consume(updateQueueName, async (message) => {
            if (message) {
                try {
                    const contestData = JSON.parse(message.content.toString());
                    console.log('Received updated contest:', contestData);

                    const contestId = contestData._id;
                    const contest = await Contest.findById(contestId);

                    if (!contest) {
                        console.error('Contest not found:', contestId);
                        return;
                    }

                    if (contestData.place) {
                        contest.place = contestData.place;
                    }

                    if (contestData.image) {
                        contest.image = contestData.image;
                    }

                    await contest.save();
                    console.log('Contest successfully updated:', contest);
                } catch (error) {
                    console.error('Error while trying to process the message:', error);
                }
            }
        }, { noAck: true });

        console.log('Connected with RabbitMQ to process contest.updated messages');
    } catch (error) {
        console.error('Error while connecting with RabbitMQ to process contest.updated messages:', error);
    }
}

async function connectAndProcessUpdateContestStatus() {
    try {
        const connection = await amqp.connect(amqp_url);
        const channel = await connection.createChannel();
        const updateExchangeName = 'contest_status_exchange';
        const updateQueueName = 'score_status_contest_queue';

        await channel.assertExchange(updateExchangeName, 'direct', { durable: true });
        await channel.assertQueue(updateQueueName, { durable: true });
        await channel.bindQueue(updateQueueName, updateExchangeName, 'contest_status_changed');

        channel.consume(updateQueueName, async (message) => {
            if (message) {
                try {
                    const content = JSON.parse(message.content.toString());
                    console.log('Received contest status message:', content);

                    const contestId = content.contestId;
                    const contest = await Contest.findById(contestId);

                    if (!contest) {
                        console.error('Contest not found:', contestId);
                        return;
                    }

                    if (content.status !== undefined && content.status !== null && content.status !== '') {
                        contest.statusOpen = content.status;
                    }

                    await contest.save();
                    console.log('Contest status successfully updated:', contest);
                } catch (error) {
                    console.error('Error while trying to process the message:', error);
                }
            }
        }, { noAck: true });

        console.log('Connected with RabbitMQ to process contest status update messages');
    } catch (error) {
        console.error('Error while connecting with RabbitMQ to process contest status update messages:', error);
    }
}

async function connectToRabbitMQCreateContest() {
    try {
        const connection = await amqp.connect(amqp_url);
        const channel = await connection.createChannel();
        const contestExchangeName = 'contest_exchange';
        const contestQueueName = 'score_contest_created_queue';

        await channel.assertExchange(contestExchangeName, 'direct', { durable: true });
        await channel.assertQueue(contestQueueName, { durable: true });
        await channel.bindQueue(contestQueueName, contestExchangeName, 'contest.created');

        channel.consume(contestQueueName, async (message) => {
            if (message) {
                try {
                    const contest = JSON.parse(message.content.toString());
                    console.log('Received contest:', contest);

                    const newContest = new Contest({
                        _id: contest._id.toString(),
                        owner: contest.owner,
                        description: contest.description,
                        place: contest.place,
                        image: contest.image,
                        endTime: contest.endTime,
                        startTime: contest.startTime,
                        statusOpen: contest.statusOpen,
                        thumbsUp: contest.thumbsUp,
                        thumbsDown: contest.thumbsDown
                    });

                    await newContest.save();
                    console.log('Contest saved to database:', newContest);
                } catch (error) {
                    console.error('Error trying to create and save the contest:', error);
                }
            }
        }, { noAck: true });

        console.log('Connected with RabbitMQ to process contest.created messages.');
    } catch (error) {
        console.error('Error while connecting with RabbitMQ to process contest.created messages:', error);
    }
}

async function connectAndDeleteContests() {
    try {
        const connection = await amqp.connect(amqp_url);
        const channel = await connection.createChannel();
        const updateExchangeName = 'contest_delete_exchange';
        const updateQueueName = 'score_delete_contest_queue';

        await channel.assertExchange(updateExchangeName, 'direct', { durable: true });
        await channel.assertQueue(updateQueueName, { durable: true });
        await channel.bindQueue(updateQueueName, updateExchangeName, 'contest.deleted');

        channel.consume(updateQueueName, async (message) => {
            if (message) {
                try {
                    const contestData = JSON.parse(message.content.toString());
                    console.log('Received deleted contest:', contestData);

                    const contestId = contestData._id;
                    const contest = await Contest.findById(contestId);

                    if (!contest) {
                        console.error('Contest not found:', contestId);
                        return;
                    }

                    await Submission.deleteMany({ contest: contest });
                    await Contest.deleteOne({ _id: contestId });
                    console.log('Contest succesfully deleted:', contest);
                } catch (error) {
                    console.error('Error trying to delete the contest:', error);
                }
            }
        }, { noAck: true });

        console.log('Connected with RabbitMQ to process contest.deleted messages.');
    } catch (error) {
        console.error('Error while connecting with RabbitMQ to process contest.deleted messages:', error);
    }
}

async function connectAndDeleteSubmissions() {
    try {
        const connection = await amqp.connect(amqp_url);
        const channel = await connection.createChannel();
        const updateExchangeName = 'submission_deleted_exchange';
        const updateQueueName = 'score_delete_submission_queue';

        await channel.assertExchange(updateExchangeName, 'direct', { durable: true });
        await channel.assertQueue(updateQueueName, { durable: true });
        await channel.bindQueue(updateQueueName, updateExchangeName, 'submission.deleted');

        channel.consume(updateQueueName, async (message) => {
            if (message) {
                try {
                    const submissionData = JSON.parse(message.content.toString());
                    console.log('Received deleted submission:', submissionData);

                    const submissionId = submissionData._id;
                    const submission = await Submission.findById(submissionId);

                    if (!submission) {
                        console.error('Submission not found:', submissionId);
                        return;
                    }

                    await Submission.deleteOne({ _id: submissionId });
                    console.log('Submission successfully deleted:', submission);
                } catch (error) {
                    console.error('Error trying to delete the submission:', error);
                }
            }
        }, { noAck: true });

        console.log('Connected with RabbitMQ to process submission.deleted messages.');
    } catch (error) {
        console.error('Error while connecting with RabbitMQ to process submission.deleted messages:', error);
    }
}

async function connectAndProcessContestVotingUpdate() {
    try {
        const connection = await amqp.connect(amqp_url);
        const channel = await connection.createChannel();
        const updateExchangeName = 'contest_voting_exchange';
        const updateQueueName = 'score_contest_votes_queue';

        await channel.assertExchange(updateExchangeName, 'direct', { durable: true });
        await channel.assertQueue(updateQueueName, { durable: true });
        await channel.bindQueue(updateQueueName, updateExchangeName, 'contest.votesUpdated');

        channel.consume(updateQueueName, async (message) => {
            if (message) {
                try {
                    const contestData = JSON.parse(message.content.toString());
                    console.log('Received updated contest:', contestData);

                    const contestId = contestData._id;
                    const contest = await Contest.findById(contestId);

                    if (!contest) {
                        console.error('Contest not found:', contestId);
                        return;
                    }

                    if (contestData.thumbsUp !== undefined && contestData.thumbsDown !== undefined) {
                        contest.thumbsUp = contestData.thumbsUp
                        contest.thumbsDown = contestData.thumbsDown
                    }

                    await contest.save();
                    console.log('Contest successfully updated:', contest);
                } catch (error) {
                    console.error('Error trying to update the contest:', error);
                }
            }
        }, { noAck: true });

        console.log('Connected with RabbitMQ to process contest.votesUpdated messages.');
    } catch (error) {
        console.error('Error while connecting with RabbitMQ to process contest.votesUpdated messages:', error);
    }
}

// Function to call score service for determining the score of the submission
async function updateSubmissionScore(submissionId) {
    const headers = {
        'Gateway': gatewayToken,
        'Content-Type': 'application/json'
    };

    try {
        // Make a POST request to the score service endpoint
        await axios.put('http://localhost:10000/scores/update-score', { submissionId }, { headers });
        console.log('Score updated');
    } catch (error) {
        console.error('Error updating score:', error);
        throw new Error('Failed to update submission score');
    }
}

async function connectAndProcessMessages() {
    await connectToRabbitMQCreateSubmission();
    await connectToRabbitMQCreateContest();
    await connectToRabbitMQUpdateSubmission();
    await connectAndProcessContestUpdate();
    await connectAndProcessUpdateContestStatus();
    await connectAndDeleteContests();
    await connectAndDeleteSubmissions();
    await connectAndProcessContestVotingUpdate();
}

connectAndProcessMessages();

// Starting the server
const PORT = process.env.SCOREPORT || 10000;
app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
});
