require('dotenv').config({ path: '../.env' })

const express = require('express');
const mongoose = require('mongoose');
const amqp = require('amqplib');
const Contest = require('./models/Contest');
const clockRoutes = require('./routes/clock');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use('/contests', clockRoutes);

// MongoDB-connecting
mongoose.connect('mongodb://localhost:27017/clock-service')
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.log(err));

async function connectAndCreateContests() {
    try {
        const connection = await amqp.connect('amqp://localhost');
        const channel = await connection.createChannel();
        const contestExchangeName = 'contest_exchange';
        const contestQueueName = 'contest_clock_created_queue';

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

                    console.log('New contest saved in the database:', newContest);
                } catch (error) {
                    console.error('Error while processing the message:', error);
                }
            }
        }, { noAck: true });

        console.log('Connected with RabbitMQ to process contest.created messages.');
    } catch (error) {
        console.error('Error while connecting with RabbitMQ to process contest.created messages:', error);
    }
}

async function connectAndProcessUpdateMessages() {
    try {
        const connection = await amqp.connect('amqp://localhost');
        const channel = await connection.createChannel();
        const updateExchangeName = 'update_contest_exchange';
        const updateQueueName = 'update_contest_clock_queue';

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

                    const remainingTime = new Date(contest.endTime).getTime() - Date.now();
                    if (remainingTime > 0) {
                        setTimeout(() => { closeContest(contestId) }, remainingTime);
                    } else {
                        await closeContest(contestId);
                    }

                    console.log('Contest successfully updated:', contest);
                } catch (error) {
                    console.error('Error while processing the message:', error);
                }
            }
        }, { noAck: true });

        console.log('Connected with RabbitMQ to process contest.updated messages');
    } catch (error) {
        console.error('Error while connecting with RabbitMQ to process contest.updated messages:', error);
    }
}

async function connectAndDeleteContests() {
    try {
        const connection = await amqp.connect('amqp://localhost');
        const channel = await connection.createChannel();
        const updateExchangeName = 'contest_delete_exchange';
        const updateQueueName = 'clock_delete_contest_queue';

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
                    console.error('Error while deleting the contest:', error);
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
        const connection = await amqp.connect('amqp://localhost');
        const channel = await connection.createChannel();
        const updateExchangeName = 'contest_voting_exchange';
        const updateQueueName = 'clock_contest_votes_queue';

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
                    console.error('Error while processing the message:', error);
                }
            }
        }, { noAck: true });

        console.log('Connected with RabbitMQ to process contest.votesUpdated messages');
    } catch (error) {
        console.error('Error while connecting with RabbitMQ to process contest.votesUpdated messages:', error);
    }
}

async function closeContest(contestId) {
    try {
        let contest = await Contest.findById(contestId);
        if (!contest) {
            return console.error(`No contest with this contestId exists: ${contestId}`);
        }

        contest.statusOpen = false;
        await contest.save();

        console.log(`The contest with ID ${contest._id} is closed because it has ended.`);

        const channel = await amqp.connect('amqp://localhost').then(connection => connection.createChannel());
        const exchangeName = 'contest_status_exchange';
        await channel.assertExchange(exchangeName, 'direct', { durable: true });
        const message = {
            contestId: contestId,
            status: false
        };
        channel.publish(exchangeName, 'contest_status_changed', Buffer.from(JSON.stringify(message)));
        console.log(`Message sent to RabbitMQ about the closed contest with ID ${contest._id}`);
    } catch (error) {
        console.error(`Error while closing the contest with ID ${contestId}:`, error);
    }
}

async function checkExpiredContests() {
    try {
        const expiredContests = await Contest.find({ endTime: { $lt: new Date() }, statusOpen: true });

        for (const contest of expiredContests) {
            await closeContest(contest._id);
        }
    } catch (error) {
        console.error('Error while checking expired contests:', error);
    }
}

async function connectAndProcessMessages() {
    await connectAndCreateContests();
    await connectAndProcessUpdateMessages();
    await connectAndDeleteContests();
    await connectAndProcessContestVotingUpdate();
}

connectAndProcessMessages();
checkExpiredContests();
setInterval(checkExpiredContests, 5 * 60 * 1000);

// Starting the server
const PORT = process.env.CLOCKPORT || 9000;
app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
});
