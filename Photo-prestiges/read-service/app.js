const express = require('express');
const mongoose = require('mongoose');
const amqp = require('amqplib');
const Contest = require('./models/Contest');
const readRoutes = require('./routes/read');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use('/contests', readRoutes);

// MongoDB-verbinding
mongoose.connect('mongodb://localhost:27017/read-service')
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.log(err));

async function connectAndProcessContestMessages() {
    try {
        const connection = await amqp.connect('amqp://localhost');
        const channel = await connection.createChannel();
        const contestExchangeName = 'contest_exchange';
        const contestQueueName = 'contest_queue';

        await channel.assertExchange(contestExchangeName, 'direct', { durable: true });
        await channel.assertQueue(contestQueueName, { durable: true });
        await channel.bindQueue(contestQueueName, contestExchangeName, 'contest.created');

        channel.consume(contestQueueName, async (message) => {
            if (message) {
                try {
                    const contest = JSON.parse(message.content.toString());
                    console.log('Ontvangen wedstrijd:', contest);

                    const newContest = new Contest({
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
        const updateQueueName = 'update_contest_queue';

        await channel.assertExchange(updateExchangeName, 'direct', { durable: true });
        await channel.assertQueue(updateQueueName, { durable: true });
        await channel.bindQueue(updateQueueName, updateExchangeName, 'contest.updated');

        channel.consume(updateQueueName, async (message) => {
            if (message) {
                try {
                    const contestData = JSON.parse(message.content.toString());
                    console.log('Ontvangen bijgewerkte wedstrijd:', contestData);

                    const contestId = contestData.id;
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

async function connectAndProcessMessages() {
    await connectAndProcessContestMessages();
    // await connectAndProcessUpdateMessages();
}

connectAndProcessMessages();

// Start de server
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
    console.log(`Server gestart op poort ${PORT}`);
});
