const express = require('express');
const mongoose = require('mongoose');
const confRoutes = require('./routes/confirmation.js');
const amqp = require('amqplib');
const User = require('./models/User');
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
async function connectToRabbitMQ() {
    try {
        const connection = await amqp.connect('amqp://localhost');
        const channel = await connection.createChannel();
        const exchangeName = 'user_exchange';
        const queueName = 'mail_service_queue';

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

connectToRabbitMQ();

// Start de server
const PORT = process.env.PORT || 6000;
app.listen(PORT, () => {
    console.log(`Server gestart op poort ${PORT}`);
});
