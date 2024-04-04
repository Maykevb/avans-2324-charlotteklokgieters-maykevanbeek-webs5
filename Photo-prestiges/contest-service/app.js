require('dotenv').config({ path: '../.env' })

const express = require('express');
const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;
const contestRoutes = require('./routes/contests');
const amqp = require('amqplib');
const User = require('./models/User');
const Contest = require('./models/Contest')
const Submission = require('./models/Submission')
const app = express();
const amqp_url = process.env.AMQPURL;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use('/contests', contestRoutes);
app.use('/uploads', express.static('uploads'));

// MongoDB-connecting
mongoose.connect('mongodb://localhost:27017/contest-service')
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.log(err));

// RabbitMQ-connecting
async function connectToRabbitMQUserCreate() {
    try {
        const connection = await amqp.connect(amqp_url);
        const channel = await connection.createChannel();
        const exchangeName = 'user_exchange';
        const queueName = 'contest_user_created_queue';

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
                } catch (error) {
                    console.error('Error while saving the user:', error);
                }
            }
        }, { noAck: true });

        console.log('Connected with RabbitMQ consumer.');
    } catch (error) {
        console.error('Error while connecting with RabbitMQ:', error);
    }
}

async function connectAndUpdateStatusContest() {
    try {
        const connection = await amqp.connect(amqp_url);
        const channel = await connection.createChannel();
        const exchangeName = 'contest_status_exchange';
        const queueName = 'contest_service_status_update_queue';

        await channel.assertExchange(exchangeName, 'direct', { durable: true });
        await channel.assertQueue(queueName, { durable: true });
        await channel.bindQueue(queueName, exchangeName, 'contest_status_changed');

        channel.consume(queueName, async (message) => {
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
                    console.log('Contest successfully updated:', contest);
                } catch (error) {
                    console.error('Error while processing the received message:', error);
                }
            }
        }, { noAck: true });

        console.log('Connected to RabbitMQ for processing contest status messages.');
    } catch (error) {
        console.error('Error connecting to RabbitMQ for processing contest status messages:', error);
    }
}

async function connectSubmissionScoreUpdate() {
    try {
        const connection = await amqp.connect(amqp_url);
        const channel = await connection.createChannel();
        const exchangeName = 'submission_score_exchange';
        const queueName = 'score_service_queue';

        // Connect the queue with the exchange and routing key
        await channel.assertExchange(exchangeName, 'direct', { durable: true });
        await channel.assertQueue(queueName, { durable: true });
        await channel.bindQueue(queueName, exchangeName, 'submission.scoreUpdated');

        channel.consume(queueName, async (message) => {
            if (message) {
                try {
                    const submission = JSON.parse(message.content.toString());
                    console.log('Received submission:', submission);

                    const existingSubmission = await Submission.findById( new ObjectId(submission._id) )

                    existingSubmission.score = submission.score
                    await existingSubmission.save();
                } catch (error) {
                    console.error('Error while updating the submission score:', error);
                }
            }
        }, { noAck: true });

        console.log('Connected with RabbitMQ consumer.');
    } catch (error) {
        console.error('Error while connecting to RabbitMQ:', error);
    }
}

async function connectAndProcessMessages() {
    await connectToRabbitMQUserCreate();
    await connectAndUpdateStatusContest();
    await connectSubmissionScoreUpdate();
}

connectAndProcessMessages();

// Starting the server
const PORT = process.env.CONTESTPORT || 7000;
app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
});
