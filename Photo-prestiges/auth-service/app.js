require('dotenv').config({ path: '../.env' })

const express = require('express');
const mongoose = require('mongoose');
const authRoutes = require('./routes/auth');
const amqp = require('amqplib');
const User = require('./models/User');
const bcrypt = require('bcryptjs');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use('/auth', authRoutes);

// MongoDB-connection
mongoose.connect('mongodb://localhost:27017/auth-service', {
}).then(() => console.log('MongoDB Connected'))
    .catch(err => console.log(err));

// RabbitMQ-connection
async function connectToRabbitMQUsersCreate() {
    try {
        const connection = await amqp.connect('amqp://localhost');
        const channel = await connection.createChannel();
        const exchangeName = 'user_exchange';
        const queueName = 'auth_user_created_queue';

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
                    console.log('User successfully saved in the database of the auth-service.');
                } catch (error) {
                    console.error('Error when saving the user:', error);
                }
            }
        }, { noAck: true });

        console.log('Connected with RabbitMQ');
    } catch (error) {
        console.error('Error when connecting with RabbitMQ:', error);
    }
}

async function connectAndProcessMessages() {
    await connectToRabbitMQUsersCreate();
}

connectAndProcessMessages();

// Starting the server
const PORT = process.env.AUTHPORT || 3000;
app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
});
