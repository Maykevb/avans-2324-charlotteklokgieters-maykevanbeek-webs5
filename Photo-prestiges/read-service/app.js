require('dotenv').config({ path: '../.env' })

const express = require('express');
const mongoose = require('mongoose');
const amqp = require('amqplib');
const Contest = require('./models/Contest');
const readRoutes = require('./routes/read');
const app = express();
const amqp_url = process.env.AMQPURL;

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use('/read', readRoutes);

// MongoDB-connection
mongoose.connect('mongodb://localhost:27017/read-service')
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.log(err));

async function connectAndProcessCreateContest() {
    try {
        const connection = await amqp.connect(amqp_url);
        const channel = await connection.createChannel();
        const contestExchangeName = 'contest_exchange';
        const contestQueueName = 'read_contest_created_queue';

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
                    console.error('Error while trying to process the message:', error);
                }
            }
        }, { noAck: true });

        console.log('Connected with RabbitMQ to process contest.created messages.');
    } catch (error) {
        console.error('Error while connecting with RabbitMQ to process contest.created messages:', error);
    }
}

async function connectAndProcessUpdateContest() {
    try {
        const connection = await amqp.connect(amqp_url);
        const channel = await connection.createChannel();
        const updateExchangeName = 'update_contest_exchange';
        const updateQueueName = 'read_update_contest_queue';

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

async function connectAndProcessContestStatusUpdate() {
    try {
        const connection = await amqp.connect(amqp_url);
        const channel = await connection.createChannel();
        const exchangeName = 'contest_status_exchange';
        const queueName = 'read_contest_status_update_queue';

        await channel.assertExchange(exchangeName, 'direct', { durable: true });
        await channel.assertQueue(queueName, { durable: true });
        await channel.bindQueue(queueName, exchangeName, 'contest_status_changed');

        channel.consume(queueName, async (message) => {
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

        console.log('Connected with RabbitMQ to process contest status update messages.');
    } catch (error) {
        console.error('Error while connecting with RabbitMQ to process contest status update messages:', error);
    }
}

async function connectAndDeleteContests() {
    try {
        const connection = await amqp.connect(amqp_url);
        const channel = await connection.createChannel();
        const updateExchangeName = 'contest_delete_exchange';
        const updateQueueName = 'read_delete_contest_queue';

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

                    await Contest.deleteOne({ _id: contestId });
                    console.log('Contest successfully deleted:', contest);
                } catch (error) {
                    console.error('Error while trying to process the message:', error);
                }
            }
        }, { noAck: true });

        console.log('Connected with RabbitMQ to process contest.deleted messages');
    } catch (error) {
        console.error('Error while connecting with RabbitMQ to process contest.deleted messages:', error);
    }
}

async function connectAndProcessContestVotingUpdate() {
    try {
        const connection = await amqp.connect(amqp_url);
        const channel = await connection.createChannel();
        const updateExchangeName = 'contest_voting_exchange';
        const updateQueueName = 'read_contest_votes_queue';

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
                    console.error('Error while trying to process the message:', error);
                }
            }
        }, { noAck: true });

        console.log('Connected with RabbitMQ to process contest.votesUpdated messages');
    } catch (error) {
        console.error('Error while connecting with RabbitMQ to process contest.votesUpdated messages:', error);
    }
}

async function connectAndProcessMessages() {
    await connectAndProcessCreateContest();
    await connectAndProcessUpdateContest();
    await connectAndProcessContestStatusUpdate();
    await connectAndDeleteContests();
    await connectAndProcessContestVotingUpdate();
}

connectAndProcessMessages();

// Starting the server
const PORT = process.env.READPORT || 8000;
app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
});
