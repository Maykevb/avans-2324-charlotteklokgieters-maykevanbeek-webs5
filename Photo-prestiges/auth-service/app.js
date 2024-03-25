const express = require('express');
const mongoose = require('mongoose');
const authRoutes = require('./routes/auth');
const amqp = require('amqplib');
const User = require('./models/User');
const bcrypt = require('bcryptjs');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// MongoDB-verbinding
mongoose.connect('mongodb://localhost:27017/auth-service', {
}).then(() => console.log('MongoDB Connected'))
    .catch(err => console.log(err));

// RabbitMQ-verbinding
async function connectToRabbitMQ() {
    try {
        const connection = await amqp.connect('amqp://localhost');
        const channel = await connection.createChannel();
        const exchangeName = 'user_exchange';
        const queueName = 'auth_service_queue';

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

                    console.log('Gebruiker succesvol opgeslagen in de database van auth-service');
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

connectToRabbitMQ();

// Routes
app.use('/auth', authRoutes);

// Het opstarten van de server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server gestart op poort ${PORT}`);
});
