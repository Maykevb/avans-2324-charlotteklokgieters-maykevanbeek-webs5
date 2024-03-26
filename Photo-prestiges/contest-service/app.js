const express = require('express');
const mongoose = require('mongoose');
const contestRoutes = require('./routes/contests');
const amqp = require('amqplib');
const User = require('./models/User');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use('/contests', contestRoutes);

// MongoDB-verbinding
mongoose.connect('mongodb://localhost:27017/contest-service')
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.log(err));

// RabbitMQ-verbinding
async function connectToRabbitMQ() {
    try {
        const connection = await amqp.connect('amqp://localhost');
        const channel = await connection.createChannel();
        const exchangeName = 'user_exchange';
        const queueName = 'contest_service_queue';

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

connectToRabbitMQ();

// Start de server
const PORT = process.env.PORT || 7000;
app.listen(PORT, () => {
    console.log(`Server gestart op poort ${PORT}`);
});
