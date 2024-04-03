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

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use('/contests', contestRoutes);
app.use('/uploads', express.static('uploads'));

// MongoDB-verbinding
mongoose.connect('mongodb://localhost:27017/contest-service')
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.log(err));

// RabbitMQ-verbinding
async function connectToRabbitMQUserCreate() {
    try {
        const connection = await amqp.connect('amqp://localhost');
        const channel = await connection.createChannel();
        const exchangeName = 'user_exchange';
        const queueName = 'contest_user_created_queue';

        // Verbind de queue met de exchange en routing key
        await channel.assertExchange(exchangeName, 'direct', { durable: true });
        await channel.assertQueue(queueName, { durable: true });
        await channel.bindQueue(queueName, exchangeName, 'user.created');

        channel.consume(queueName, async (message) => {
            if (message) {
                try {
                    const user = JSON.parse(message.content.toString());
                    console.log('Ontvangen gebruiker:', user);

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
                    console.error('Fout bij het opslaan van de gebruiker:', error);
                }
            }
        }, { noAck: true });

        console.log('Verbonden met RabbitMQ consumer');
    } catch (error) {
        console.error('Fout bij verbinden met RabbitMQ:', error);
    }
}

async function connectAndUpdateStatusContest() {
    try {
        const connection = await amqp.connect('amqp://localhost');
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
                    console.log('Ontvangen bericht over de wedstrijdstatus:', content);

                    const contestId = content.contestId;
                    const contest = await Contest.findById(contestId);

                    if (!contest) {
                        console.error('Wedstrijd niet gevonden in de database:', contestId);
                        return;
                    }

                    if (content.status !== undefined && content.status !== null && content.status !== '') {
                        contest.statusOpen = content.status;
                    }

                    await contest.save();
                    console.log('Wedstrijd succesvol bijgewerkt:', contest);
                } catch (error) {
                    console.error('Fout bij het verwerken van het ontvangen bericht:', error);
                }
            }
        }, { noAck: true });

        console.log('Verbonden met RabbitMQ voor het verwerken van wedstrijdstatusberichten');
    } catch (error) {
        console.error('Fout bij verbinden met RabbitMQ voor het verwerken van wedstrijdstatusberichten:', error);
    }
}

async function connectSubmissionScoreUpdate() {
    try {
        const connection = await amqp.connect('amqp://localhost');
        const channel = await connection.createChannel();
        const exchangeName = 'submission_score_exchange';
        const queueName = 'score_service_queue';

        // Verbind de queue met de exchange en routing key
        await channel.assertExchange(exchangeName, 'direct', { durable: true });
        await channel.assertQueue(queueName, { durable: true });
        await channel.bindQueue(queueName, exchangeName, 'submission.scoreUpdated');

        channel.consume(queueName, async (message) => {
            if (message) {
                try {
                    const submission = JSON.parse(message.content.toString());
                    console.log('Ontvangen submission:', submission);

                    const existingSubmission = await Submission.findById( new ObjectId(submission._id) )

                    existingSubmission.score = submission.score
                    await existingSubmission.save();
                } catch (error) {
                    console.error('Fout bij het updaten van de submission score:', error);
                }
            }
        }, { noAck: true });

        console.log('Verbonden met RabbitMQ consumer');
    } catch (error) {
        console.error('Fout bij verbinden met RabbitMQ:', error);
    }
}

async function connectAndProcessMessages() {
    await connectToRabbitMQUserCreate();
    await connectAndUpdateStatusContest();
    await connectSubmissionScoreUpdate();
}

connectAndProcessMessages();

// Start de server
const PORT = process.env.CONTESTPORT || 7000;
app.listen(PORT, () => {
    console.log(`Server gestart op poort ${PORT}`);
});
