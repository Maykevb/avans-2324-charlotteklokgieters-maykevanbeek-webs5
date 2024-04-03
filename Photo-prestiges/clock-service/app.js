const express = require('express');
const mongoose = require('mongoose');
const amqp = require('amqplib');
const Contest = require('./models/Contest');
const clockRoutes = require('./routes/clock');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use('/contests', clockRoutes);

// MongoDB-verbinding
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

                    const remainingTime = contest.endTime - Date();
                    if (remainingTime > 0) {
                        setTimeout(() => { closeContest(contestId) }, remainingTime);
                    } else {
                        await closeContest(contestId);
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
                    console.log('Ontvangen verwijderde wedstrijd:', contestData);

                    const contestId = contestData._id;
                    const contest = await Contest.findById(contestId);

                    if (!contest) {
                        console.error('Wedstrijd niet gevonden in de database:', contestId);
                        return;
                    }

                    await Contest.deleteOne({ _id: contestId });
                    console.log('Wedstrijd succesvol verwijderd:', contest);
                } catch (error) {
                    console.error('Fout bij het verwijderen van het bijgewerkte bericht:', error);
                }
            }
        }, { noAck: true });

        console.log('Verbonden met RabbitMQ voor het verwerken van contest.deleted berichten');
    } catch (error) {
        console.error('Fout bij verbinden met RabbitMQ voor het verwerken van contest.deleted berichten:', error);
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

async function closeContest(contestId) {
    try {
        let contest = await Contest.findById(contestId);
        if (!contest) {
            return console.error(`Er bestaat geen wedstrijd met ID ${contestId}`);
        }

        contest.statusOpen = false;
        await contest.save();

        console.log(`Wedstrijd met ID ${contest._id} is gesloten omdat de eindtijd is verstreken.`);

        const channel = await amqp.connect('amqp://localhost').then(connection => connection.createChannel());
        const exchangeName = 'contest_status_exchange';
        await channel.assertExchange(exchangeName, 'direct', { durable: true });
        const message = {
            contestId: contestId,
            status: false
        };
        channel.publish(exchangeName, 'contest_status_changed', Buffer.from(JSON.stringify(message)));
        console.log(`Bericht verzonden naar RabbitMQ over de gesloten wedstrijd met ID ${contest._id}`);
    } catch (error) {
        console.error(`Fout bij het sluiten van de wedstrijd met ID ${contestId}:`, error);
    }
}

async function checkExpiredContests() {
    try {
        const expiredContests = await Contest.find({ endTime: { $lt: new Date() }, statusOpen: true });

        for (const contest of expiredContests) {
            await closeContest(contest._id);
        }
    } catch (error) {
        console.error('Fout bij het controleren van verlopen wedstrijden:', error);
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

// Start de server
const PORT = process.env.PORT || 9000;
app.listen(PORT, () => {
    console.log(`Server gestart op poort ${PORT}`);
});
