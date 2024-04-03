require('dotenv').config({ path: '../.env' })

const express = require('express');
const mongoose = require('mongoose');
const confRoutes = require('./routes/confirmation.js');
const amqp = require('amqplib');
const User = require('./models/User');
const Contest = require('./models/Contest')
const Submission = require('./models/Submission')
const app = express();
const axios = require('axios');

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use('/confirmation', confRoutes);

// MongoDB-connection
mongoose.connect('mongodb://localhost:27017/mail-service')
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.log(err));

// RabbitMQ-connection
async function connectToRabbitMQUserCreate() {
    try {
        const connection = await amqp.connect('amqp://localhost');
        const channel = await connection.createChannel();
        const exchangeName = 'user_exchange';
        const queueName = 'mail_user_created_queue';

        // Connect the queue with the exchange and routing key
        await channel.assertExchange(exchangeName, 'direct', { durable: true });
        await channel.assertQueue(queueName, { durable: true });
        await channel.bindQueue(queueName, exchangeName, 'user.created');

        channel.consume(queueName, async (message) => {
            if (message) {
                try {
                    const user = JSON.parse(message.content.toString());
                    console.log('Received user:', user);

                    const isPasswordHashed = /^(?=.*[a-zA-Z])(?=.*[0-9])/.test(user.password);
                    const hashedPassword = isPasswordHashed ? user.password : await bcrypt.hash(user.password, 10);

                    const newUser = new User({
                        _id: user._id.toString(),
                        username: user.username,
                        email: user.email,
                        password: hashedPassword,
                        role: user.role
                    });
                    await newUser.save();

                    console.log('User successfully saved to the database of the mail-service.');

                    // TODO
                    // await sendConfirmationEmail(user.email, user.username, user.password);
                } catch (error) {
                    console.error('Error while saving the user:', error);
                }
            }
        }, { noAck: true });

        console.log('Connected with RabbitMQ');
    } catch (error) {
        console.error('Error while connecting to RabbitMQ:', error);
    }
}

async function connectAndProcessUpdateContestStatus() {
    try {
        const connection = await amqp.connect('amqp://localhost');
        const channel = await connection.createChannel();
        const updateExchangeName = 'contest_status_exchange';
        const updateQueueName = 'mail_send_score_to_users_queue';

        await channel.assertExchange(updateExchangeName, 'direct', { durable: true });
        await channel.assertQueue(updateQueueName, { durable: true });
        await channel.bindQueue(updateQueueName, updateExchangeName, 'contest_status_changed');

        channel.consume(updateQueueName, async (message) => {
            if (message) {
                try {
                    const content = JSON.parse(message.content.toString());
                    console.log('Received message of the contest status:', content);

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

                    if (!contest.statusOpen) {
                        // TODO
                        // await sendEndScore(contest._id)
                    }

                    console.log('Contest successfully updated:', contest);
                } catch (error) {
                    console.error('Error while updating the contest:', error);
                }
            }
        }, { noAck: true });

        console.log('Connected with RabbitMQ for processing contest status update messages.');
    } catch (error) {
        console.error('Error while connecting to RabbitMQ for processing contest status update messages:', error);
    }
}

async function connectToRabbitMQCreateContest() {
    try {
        const connection = await amqp.connect('amqp://localhost');
        const channel = await connection.createChannel();
        const contestExchangeName = 'contest_exchange';
        const contestQueueName = 'mail_contest_created_queue';

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
                        endTime: contest.endTime
                    });

                    await newContest.save();

                    console.log('Contest saved to database:', newContest);
                } catch (error) {
                    console.error('Error while trying to process the message:', error);
                }
            }
        }, { noAck: true });

        console.log('Connected with RabbitMQ to process contest.created messages.');
    } catch (error) {
        console.error('Error while connecting with RabbitMQ to process contest.created messages:', error);
    }
}

async function connectToRabbitMQCSubmissionCreate() {
    try {
        const connection = await amqp.connect('amqp://localhost');
        const channel = await connection.createChannel();
        const contestExchangeName = 'submission_exchange';
        const contestQueueName = 'mail_submission_created_queue';

        await channel.assertExchange(contestExchangeName, 'direct', { durable: true });
        await channel.assertQueue(contestQueueName, { durable: true });
        await channel.bindQueue(contestQueueName, contestExchangeName, 'submission.created');

        channel.consume(contestQueueName, async (message) => {
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

        console.log('Connected with RabbitMQ to process submission.created messages');
    } catch (error) {
        console.error('Error while connecting with RabbitMQ to process submission.created messages:', error);
    }
}

async function connectAndProcessSubmissionsUpdate() {
    try {
        const connection = await amqp.connect('amqp://localhost');
        const channel = await connection.createChannel();
        const updateExchangeName = 'update_submission_exchange';
        const updateQueueName = 'mail_update_submission_queue';

        await channel.assertExchange(updateExchangeName, 'direct', { durable: true });
        await channel.assertQueue(updateQueueName, { durable: true });
        await channel.bindQueue(updateQueueName, updateExchangeName, 'submission.updated');

        channel.consume(updateQueueName, async (message) => {
            if (message) {
                try {
                    const submissionData = JSON.parse(message.content.toString());
                    console.log('Received updated submission:', submissionData);

                    const submissionId = submissionData._id;
                    const submission = await Submission.findById(submissionId);

                    if (!submissionId) {
                        console.error('Submission not found:', submissionId);
                        return;
                    }

                    if (submissionData.image) {
                        submission.image = submissionData.image;
                    }

                    await submission.save();
                    console.log('Submission successfully updated:', submission);
                } catch (error) {
                    console.error('Error while trying to process the message:', error);
                }
            }
        }, { noAck: true });

        console.log('Connected with RabbitMQ to process submission.updated messages');
    } catch (error) {
        console.error('Error while connecting with RabbitMQ to process submission.updated messages:', error);
    }
}

async function connectAndProcessSubmissionScoreUpdate() {
    try {
        const connection = await amqp.connect('amqp://localhost');
        const channel = await connection.createChannel();
        const updateExchangeName = 'submission_score_exchange';
        const updateQueueName = 'mail_update_submission_score_queue';

        await channel.assertExchange(updateExchangeName, 'direct', { durable: true });
        await channel.assertQueue(updateQueueName, { durable: true });
        await channel.bindQueue(updateQueueName, updateExchangeName, 'submission.scoreUpdated');

        channel.consume(updateQueueName, async (message) => {
            if (message) {
                try {
                    const submissionData = JSON.parse(message.content.toString());
                    console.log('Received updated submission:', submissionData);

                    const submissionId = submissionData._id;
                    const submission = await Submission.findById(submissionId);

                    if (!submissionId) {
                        console.error('Submission not found:', submissionId);
                        return;
                    }

                    if (submissionData.score) {
                        submission.score = submissionData.score;
                    }

                    await submission.save();
                    console.log('Submission score successfully updated:', submission);
                } catch (error) {
                    console.error('Error while trying to process the message:', error);
                }
            }
        }, { noAck: true });

        console.log('Connected with RabbitMQ to process submission.scoreUpdated messages.');
    } catch (error) {
        console.error('Error while connecting with RabbitMQ to process submission.scoreUpdated messages:', error);
    }
}

async function connectAndProcessContestUpdate() {
    try {
        const connection = await amqp.connect('amqp://localhost');
        const channel = await connection.createChannel();
        const updateExchangeName = 'update_contest_exchange';
        const updateQueueName = 'mail_update_contest_queue';

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

        console.log('Connected with RabbitMQ to process contest.updated messages.');
    } catch (error) {
        console.error('Error while connecting with RabbitMQ to process contest.updated messages:', error);
    }
}

async function connectAndDeleteContests() {
    try {
        const connection = await amqp.connect('amqp://localhost');
        const channel = await connection.createChannel();
        const updateExchangeName = 'contest_delete_exchange';
        const updateQueueName = 'mail_delete_contest_queue';

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
                    console.log('Contest successfully deleted:', contest);
                } catch (error) {
                    console.error('Error while trying to process the message:', error);
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
        const connection = await amqp.connect('amqp://localhost');
        const channel = await connection.createChannel();
        const updateExchangeName = 'submission_deleted_exchange';
        const updateQueueName = 'mail_delete_submission_queue';

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
                    console.log('Submission succesfully deleted:', submission);
                } catch (error) {
                    console.error('Error while trying to process the message:', error);
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
        const connection = await amqp.connect('amqp://localhost');
        const channel = await connection.createChannel();
        const updateExchangeName = 'contest_voting_exchange';
        const updateQueueName = 'mail_contest_votes_queue';

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
                    console.log('Contest succesfully updated:', contest);
                } catch (error) {
                    console.error('Error while trying to process the message:', error);
                }
            }
        }, { noAck: true });

        console.log('Connected with RabbitMQ to process contest.votesUpdated messages.');
    } catch (error) {
        console.error('Error while connecting with RabbitMQ to process contest.votesUpdated messages:', error);
    }
}

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

async function sendEndScore(contestId) {
    try {
        // Make a POST request to the mail service endpoint
        await axios.post('http://localhost:6000/confirmation/end-of-contest', { contestId });
        console.log('Endscore email request sent to mail service');
    } catch (error) {
        console.error('Error sending endscore email request to mail service:', error);
        throw new Error('Failed to send confirmation email request');
    }
}

async function connectAndProcessMessages() {
    await connectToRabbitMQUserCreate();
    await connectToRabbitMQCreateContest();
    await connectAndProcessUpdateContestStatus();
    await connectToRabbitMQCSubmissionCreate();
    await connectAndProcessSubmissionsUpdate();
    await connectAndProcessContestUpdate();
    await connectAndDeleteContests();
    await connectAndDeleteSubmissions();
    await connectAndProcessSubmissionScoreUpdate();
    await connectAndProcessContestVotingUpdate();
}

connectAndProcessMessages();

// Starting the server
const PORT = process.env.MAILPORT || 6000;
app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
});
