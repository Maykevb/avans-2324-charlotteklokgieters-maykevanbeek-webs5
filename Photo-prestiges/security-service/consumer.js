const amqp = require('amqplib');
const User = require('./models/User');

// Functie om een verbinding met RabbitMQ tot stand te brengen
async function connectToRabbitMQ() {
    try {
        const connection = await amqp.connect('amqp://localhost');
        const channel = await connection.createChannel();
        const exchangeName = 'user_exchange';
        const queueName = 'user_queue';

        // Declareer een wachtrij en bind deze aan de uitwisseling
        await channel.assertQueue(queueName, { durable: false });
        await channel.bindQueue(queueName, exchangeName, 'user.created');

        // Luister naar berichten in de wachtrij
        channel.consume(queueName, async (msg) => {
            try {
                const userData = JSON.parse(msg.content.toString());

                // Synchroniseer gebruikersgegevens met de database van de beveiligingsservice
                const user = new User(userData);
                await user.save();
                console.log('Gebruiker gesynchroniseerd met de database');
            } catch (err) {
                console.error('Fout bij het verwerken van het bericht:', err);
            }
        }, { noAck: true });

        console.log('Wacht op berichten in de wachtrij');
    } catch (error) {
        console.error('Fout bij het verbinden met RabbitMQ:', error);
    }
}

// Verbind met RabbitMQ en begin met luisteren naar berichten
connectToRabbitMQ()
