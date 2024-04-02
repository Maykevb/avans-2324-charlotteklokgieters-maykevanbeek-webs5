require('dotenv').config();

const express = require('express');
const router = express.Router();
let channel = null;
const Submission = require('../models/Submission');
const Contest = require('../models/Contest');
const mongoose = require("mongoose");
const ObjectId = mongoose.Types.ObjectId;
const axios = require('axios');
const amqp = require('amqplib');
const fs = require('fs');
const FormData = require('form-data');

// async function connectToRabbitMQ() {
//     try {
//         const connection = await amqp.connect('amqp://localhost');
//         channel = await connection.createChannel();
//
//         // Queue 1 for contests
//         const exchangeName = 'contest_exchange';
//         const queueName = 'contest_queue';
//         const routingKey = 'contest.created';
//
//         await channel.assertExchange(exchangeName, 'direct', { durable: true });
//         await channel.assertQueue(queueName, { durable: true });
//         await channel.bindQueue(queueName, exchangeName, routingKey);
//
//         console.log('Verbonden met RabbitMQ queue 1');
//
//         // Queue 2 for update contest
//         const UpdateExchangeName = 'update_contest_exchange';
//         const UpdateQueueName = 'update_contest_queue';
//         const UpdateRoutingKey = 'contest.updated';
//
//         await channel.assertExchange(UpdateExchangeName, 'direct', { durable: true });
//         await channel.assertQueue(UpdateQueueName, { durable: true });
//         await channel.bindQueue(UpdateQueueName, UpdateExchangeName, UpdateRoutingKey);
//
//         console.log('Verbonden met RabbitMQ queue 2');
//
//         // Queue 3 for submissions
//         const SubmissionExchangeName = 'submission_exchange';
//         const SubmissionQueueName = 'submission_queue';
//         const SubmissionRoutingKey = 'submission.created';
//
//         await channel.assertExchange(SubmissionExchangeName, 'direct', { durable: true });
//         await channel.assertQueue(SubmissionQueueName, { durable: true });
//         await channel.bindQueue(SubmissionQueueName, SubmissionExchangeName, SubmissionRoutingKey);
//
//         console.log('Verbonden met RabbitMQ queue 3');
//
//         // // Queue 4 for update submissions
//         // const SubmissionUpdateExchangeName = 'submission_exchange';
//         // const SubmissionUpdateQueueName = 'submission_update_queue';
//         // const SubmissionUpdateRoutingKey = 'submission.updated';
//         //
//         // await channel.assertExchange(SubmissionUpdateExchangeName, 'direct', { durable: true });
//         // await channel.assertQueue(SubmissionUpdateQueueName, { durable: true });
//         // await channel.bindQueue(SubmissionUpdateQueueName, SubmissionUpdateExchangeName, SubmissionUpdateRoutingKey);
//
//         console.log('Verbonden met RabbitMQ queue 3');
//     } catch (error) {
//         console.error('Error connecting to RabbitMQ:', error);
//     }
// }

router.post('/update-score', async (req, res) => {
    try {
        const { submissionId } = req.body;

        let submission = await Submission.findById( new ObjectId(submissionId) )
        if (!submission) {
            return res.status(404).json({ msg: 'Submission niet gevonden' });
        }

        let contest = await Contest.findById(submission.contest)
        if (!contest) {
            return res.status(403).json({ msg: 'Contest niet gevonden' });
        }

        // submission.image
        // submission.score =

        const apiKey = 'acc_5f8e9bad266e659';
        const apiSecret = '7a3b52570c37e00f7a4c0b93c32b208e';

        const subImageUrl = submission.image;
        const conImageUrl = contest.image;

        // scores[0] will be submission scores, scores[1] will be contest scores
        let urls = [subImageUrl, conImageUrl];
        let scores = [];
        // let url = 'https://api.imagga.com/v2/tags?image_url=' + encodeURIComponent(subImageUrl);
        // console.log(url)

        // const base64Encode = (str) => Buffer.from(str, 'utf8').toString('base64');
        // const authHeader = 'Basic ' + base64Encode(`${apiKey}:${apiSecret}`);
        //
        // const headers = {
        //     'Authorization': authHeader,
        //     'Accept': 'application/json'
        // };

        // for (const url of urls) {
    //     try {
    //         const response = await axios.get(url, {
    //             // headers
    //             auth: {
    //                 username: apiKey,
    //                 password: apiSecret
    //             }
    //         });
    //         // const authHeader = 'Basic ' + Buffer.from(apiKey + ':' + apiSecret).toString('base64');
    //         //
    //         // const response = await axios.get(url, {
    //         //     headers: {
    //         //         'Authorization': authHeader,
    //         //         'Accept': 'application/json'
    //         //     }
    //         // });
    //         scores.push(response);
    //         // console.log(response.data);
    //     } catch (error) {
    //         console.error('Error fetching response:', error);
    //     }
        // }

        for (const url of urls) {
            const parts = url.split('/uploads/');
            const uploadsPart = parts[1];

            const filePath = '../contest-service/uploads/' + uploadsPart;
            const formData = new FormData();
            formData.append('image', fs.createReadStream(filePath));

            await (async () => {
                try {
                    const response = await axios.post('https://api.imagga.com/v2/tags', formData, {
                        auth: {
                            username: apiKey,
                            password: apiSecret
                        }
                    });
                    scores.push(response.data.result);
                } catch (error) {
                    console.log(error);
                }
            })();
        }


        // const filePath = '.../uploads/1712038535351-Schermafbeelding_2023-06-04_155553.png';
        // const formData = new FormData();
        // formData.append('image', fs.createReadStream(filePath));
        //
        // (async () => {
        //     try {
        //         const response = await axios.post('https://api.imagga.com/v2/tags', {body: formData, username: apiKey, password: apiSecret});
        //         console.log(response);
        //     } catch (error) {
        //         console.log(error.response.body);
        //     }
        // })();



        console.log(scores)
        // console.log('got response!')

        // await submission.save();

        if (channel) {
            const exchangeName = 'submission_exchange';
            const routingKey = 'submission.updated';
            const message = JSON.stringify(submission);
            channel.publish(exchangeName, routingKey, Buffer.from(message), { persistent: true });
            console.log('Submission updated message sent to RabbitMQ');
        } else {
            console.log('RabbitMQ channel is not available. Message not sent');
        }

        res.json({ msg: 'Submission succesvol geüpdate'});
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Serverfout');
    }
});

// connectToRabbitMQ();

module.exports = router;