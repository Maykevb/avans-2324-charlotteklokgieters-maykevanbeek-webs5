const express = require('express');
const app = express();
const scoresRoutes = require('./routes/scores.js');
const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;
const amqp = require('amqplib');
const Submission = require('./models/Submission');
const Contest = require('./models/Contest');
const axios = require('axios');

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use('/scores', scoresRoutes);

// MongoDB-verbinding
mongoose.connect('mongodb://localhost:27017/score-service')
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.log(err));

// RabbitMQ-verbinding
async function connectToRabbitMQCreateSubmission() {
    try {
        const connection = await amqp.connect('amqp://localhost');
        const channel = await connection.createChannel();
        const exchangeName = 'submission_exchange';
        const queueName = 'score_submission_created_queue';

        // Verbind de queue met de exchange en routing key
        await channel.assertExchange(exchangeName, 'direct', { durable: true });
        await channel.assertQueue(queueName, { durable: true });
        await channel.bindQueue(queueName, exchangeName, 'submission.created');

        channel.consume(queueName, async (message) => {
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

        console.log('Verbonden met RabbitMQ');
    } catch (error) {
        console.error('Fout bij verbinden met RabbitMQ:', error);
    }
}

async function connectToRabbitMQUpdateSubmission() {
    try {
        const connection = await amqp.connect('amqp://localhost');
        const channel = await connection.createChannel();
        const exchangeName = 'update_submission_exchange';
        const queueName = 'score_service_submission_update_queue';

        // Verbind de queue met de exchange en routing key
        await channel.assertExchange(exchangeName, 'direct', { durable: true });
        await channel.assertQueue(queueName, { durable: true });
        await channel.bindQueue(queueName, exchangeName, 'submission.updated');

        channel.consume(queueName, async (message) => {
            if (message) {
                try {
                    const submission = JSON.parse(message.content.toString());
                    console.log('Ontvangen submission:', submission);

                    const existingSubmission = await Submission.findById( new ObjectId(submission._id) )
                    if (!existingSubmission) {
                        console.error('Submission niet gevonden.');
                        return;
                    }

                    if (submission.image) {
                        existingSubmission.image = submission.image;
                    }

                    await existingSubmission.save();
                    await updateSubmissionScore(submission._id);
                } catch (error) {
                    console.error('Fout bij het opslaan van de submission:', error);
                }
            }
        }, { noAck: true });

        console.log('Verbonden met RabbitMQ');
    } catch (error) {
        console.error('Fout bij verbinden met RabbitMQ:', error);
    }
}

async function connectAndProcessContestUpdate() {
    try {
        const connection = await amqp.connect('amqp://localhost');
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

async function connectAndProcessUpdateContestStatus() {
    try {
        const connection = await amqp.connect('amqp://localhost');
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
        const contestQueueName = 'score_contest_created_queue';

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

async function connectAndDeleteContests() {
    try {
        const connection = await amqp.connect('amqp://localhost');
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
        const updateQueueName = 'score_delete_submission_queue';

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
        const updateQueueName = 'score_contest_votes_queue';

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

                    if (contestData.thumbsUp !== undefined && contestData.thumbsDown !== undefined) {
                        contest.thumbsUp = contestData.thumbsUp
                        contest.thumbsDown = contestData.thumbsDown
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

// Function to call score service for determining the score of the submission
async function updateSubmissionScore(submissionId) {
    try {
        // Make a POST request to the score service endpoint
        await axios.put('http://localhost:10000/scores/update-score', { submissionId });
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

// Het opstarten van de server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server gestart op poort ${PORT}`);
});
