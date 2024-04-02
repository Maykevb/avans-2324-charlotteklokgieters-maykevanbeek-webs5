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

// MongoDB-verbinding
mongoose.connect('mongodb://localhost:27017/mail-service')
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.log(err));

// RabbitMQ-verbinding
async function connectToRabbitMQUserCreate() {
    try {
        const connection = await amqp.connect('amqp://localhost');
        const channel = await connection.createChannel();
        const exchangeName = 'user_exchange';
        const queueName = 'mail_user_created_queue';

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
                        username: user.username,
                        email: user.email,
                        password: hashedPassword,
                        role: user.role
                    });
                    await newUser.save();

                    console.log('Gebruiker succesvol opgeslagen in de database van mail-service');

                    // TODO
                    // await sendConfirmationEmail(user.email, user.username, user.password);
                } catch (error) {
                    console.error('Fout bij het opslaan van de gebruiker:', error);
                }
            }
        }, { noAck: true });

        console.log('Verbonden met RabbitMQ');
    } catch (error) {
        console.error('Fout bij verbinden met RabbitMQ:', error);
    }
}

async function connectAndProcessUpdateContestStatus() {
    try {
        const connection = await amqp.connect('amqp://localhost');
        const channel = await connection.createChannel();
        const updateExchangeName = 'contest_status_exchange';
        const updateQueueName = 'mail_send_score_queue';

        await channel.assertExchange(updateExchangeName, 'direct', { durable: true });
        await channel.assertQueue(updateQueueName, { durable: true });
        await channel.bindQueue(updateQueueName, updateExchangeName, 'contest_status_changed');

        channel.consume(updateQueueName, async (message) => {
            if (message) {
                try {
                    const contestData = JSON.parse(message.content.toString());
                    console.log('Ontvangen bijgewerkte wedstrijd:', contestData);

                    const contestId = contestData._id;
                    const contest = await Contest.findById(contestId);

                    if (!contest) {
                        console.error('Wedstrijd niet gevonden in de database:', contestId);
                        return;
                    }

                    const { statusOpen } = contestData;
                    if (statusOpen !== undefined) contest.statusOpen = statusOpen;

                    await contest.save();

                    if (statusOpen !== undefined && !statusOpen) {
                        await sendEndScore(contestId)
                    }

                    console.log('Wedstrijd succesvol bijgewerkt:', contest);
                } catch (error) {
                    console.error('Fout bij het verwerken van het bijgewerkte bericht:', error);
                }
            }
        }, { noAck: true });

        console.log('Verbonden met RabbitMQ voor het verwerken van contest.updated berichten');
    } catch (error) {
        console.error('Fout bij verbinden met RabbitMQ voor het verwerken van contest.updated berichten:', error);
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
                    console.log('Ontvangen wedstrijd:', contest);

                    const newContest = new Contest({
                        _id: contest._id.toString(),
                        owner: contest.owner,
                        description: contest.description,
                        place: contest.place,
                        image: contest.image,
                        endTime: contest.endTime
                    });

                    await newContest.save();

                    console.log('Nieuwe wedstrijd opgeslagen in de database:', newContest);
                } catch (error) {
                    console.error('Fout bij het verwerken van het bericht:', error);
                }
            }
        }, { noAck: true });

        console.log('Verbonden met RabbitMQ voor het verwerken van contest.created berichten');
    } catch (error) {
        console.error('Fout bij verbinden met RabbitMQ voor het verwerken van contest.created berichten:', error);
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
                    console.log('Ontvangen submission:', submission);

                    const newSubmission = new Submission({
                        _id: submission._id,
                        contest: submission.contest,
                        participant: submission.participant,
                        image: submission.image,
                        score: submission.score
                    });

                    await newSubmission.save();

                    console.log('Nieuwe submission opgeslagen in de database:', newSubmission);
                } catch (error) {
                    console.error('Fout bij het verwerken van het bericht:', error);
                }
            }
        }, { noAck: true });

        console.log('Verbonden met RabbitMQ voor het verwerken van submission.created berichten');
    } catch (error) {
        console.error('Fout bij verbinden met RabbitMQ voor het verwerken van submission.created berichten:', error);
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
                    console.log('Ontvangen bijgewerkte submission:', submissionData);

                    const submissionId = submissionData._id;
                    const submission = await Submission.findById(submissionId);

                    if (!submissionId) {
                        console.error('Submission niet gevonden in de database:', submissionId);
                        return;
                    }

                    if (submissionData.image) {
                        submission.image = submissionData.image;
                    }

                    await submission.save();
                    console.log('Submission succesvol bijgewerkt:', submission);
                } catch (error) {
                    console.error('Fout bij het verwerken van het bijgewerkte bericht:', error);
                }
            }
        }, { noAck: true });

        console.log('Verbonden met RabbitMQ voor het verwerken van submission.updated berichten');
    } catch (error) {
        console.error('Fout bij verbinden met RabbitMQ voor het verwerken van submission.updated berichten:', error);
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
                    console.log('Ontvangen bijgewerkte submission:', submissionData);

                    const submissionId = submissionData._id;
                    const submission = await Submission.findById(submissionId);

                    if (!submissionId) {
                        console.error('Submission niet gevonden in de database:', submissionId);
                        return;
                    }

                    if (submissionData.score) {
                        submission.score = submissionData.score;
                    }

                    await submission.save();
                    console.log('Submission succesvol bijgewerkt:', submission);
                } catch (error) {
                    console.error('Fout bij het verwerken van het bijgewerkte bericht:', error);
                }
            }
        }, { noAck: true });

        console.log('Verbonden met RabbitMQ voor het verwerken van submission.scoreUpdated berichten');
    } catch (error) {
        console.error('Fout bij verbinden met RabbitMQ voor het verwerken van submission.scoreUpdated berichten:', error);
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
                    console.log('Ontvangen bijgewerkte wedstrijd:', contestData);

                    const contestId = contestData._id;
                    const contest = await Contest.findById(contestId);

                    if (!contest) {
                        console.error('Wedstrijd niet gevonden in de database:', contestId);
                        return;
                    }

                    if (contestData.place) {
                        contest.place = contestData.place;
                    }
                    if (contestData.image) {
                        contest.image = contestData.image;
                    }

                    await contest.save();
                    console.log('Wedstrijd succesvol bijgewerkt:', contest);
                } catch (error) {
                    console.error('Fout bij het verwerken van het bijgewerkte bericht:', error);
                }
            }
        }, { noAck: true });

        console.log('Verbonden met RabbitMQ voor het verwerken van contest.updated berichten');
    } catch (error) {
        console.error('Fout bij verbinden met RabbitMQ voor het verwerken van contest.updated berichten:', error);
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
                    console.log('Ontvangen bijgewerkte wedstrijd:', contestData);

                    const contestId = contestData._id;
                    const contest = await Contest.findById(contestId);

                    if (!contest) {
                        console.error('Wedstrijd niet gevonden in de database:', contestId);
                        return;
                    }

                    await Submission.deleteMany({ contest: contest });
                    await Contest.deleteOne({ _id: contestId });
                    console.log('Wedstrijd succesvol bijgewerkt:', contest);
                } catch (error) {
                    console.error('Fout bij het verwerken van het bijgewerkte bericht:', error);
                }
            }
        }, { noAck: true });

        console.log('Verbonden met RabbitMQ voor het verwerken van contest.deleted berichten');
    } catch (error) {
        console.error('Fout bij verbinden met RabbitMQ voor het verwerken van contest.deleted berichten:', error);
    }
}

async function connectAndDeleteSubmissions() {
    try {
        const connection = await amqp.connect('amqp://localhost');
        const channel = await connection.createChannel();
        const updateExchangeName = 'submission_deleted_exchange';
        const updateQueueName = 'clock_delete_submission_queue';

        await channel.assertExchange(updateExchangeName, 'direct', { durable: true });
        await channel.assertQueue(updateQueueName, { durable: true });
        await channel.bindQueue(updateQueueName, updateExchangeName, 'submission.deleted');

        channel.consume(updateQueueName, async (message) => {
            if (message) {
                try {
                    const submissionData = JSON.parse(message.content.toString());
                    console.log('Ontvangen bijgewerkte submission:', submissionData);

                    const submissionId = submissionData._id;
                    const submission = await Submission.findById(submissionId);

                    if (!submission) {
                        console.error('Submission niet gevonden in de database:', submissionId);
                        return;
                    }

                    await Submission.deleteOne({ _id: submissionId });
                    console.log('Submission succesvol bijgewerkt:', submission);
                } catch (error) {
                    console.error('Fout bij het verwerken van het bijgewerkte bericht:', error);
                }
            }
        }, { noAck: true });

        console.log('Verbonden met RabbitMQ voor het verwerken van submission.deleted berichten');
    } catch (error) {
        console.error('Fout bij verbinden met RabbitMQ voor het verwerken van submission.deleted berichten:', error);
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
                    console.log('Ontvangen bijgewerkte wedstrijd:', contestData);

                    const contestId = contestData._id;
                    const contest = await Contest.findById(contestId);

                    if (!contest) {
                        console.error('Wedstrijd niet gevonden in de database:', contestId);
                        return;
                    }

                    if (contestData.thumbsUp !== undefined && contestData.thumbsUp) {
                        contest.thumbsUp += contest.thumbsUp
                    } else if (contestData.thumbsUp !== undefined) {
                        contest.thumbsDown += contest.thumbsDown
                    }

                    await contest.save();
                    console.log('Wedstrijd succesvol bijgewerkt:', contest);
                } catch (error) {
                    console.error('Fout bij het verwerken van het bijgewerkte bericht:', error);
                }
            }
        }, { noAck: true });

        console.log('Verbonden met RabbitMQ voor het verwerken van contest.votesUpdated berichten');
    } catch (error) {
        console.error('Fout bij verbinden met RabbitMQ voor het verwerken van contest.votesUpdated berichten:', error);
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

await connectAndProcessMessages();

// Start de server
const PORT = process.env.PORT || 6000;
app.listen(PORT, () => {
    console.log(`Server gestart op poort ${PORT}`);
});
