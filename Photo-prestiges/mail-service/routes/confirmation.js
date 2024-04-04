require('dotenv').config({ path: '../.env' })

const express = require('express');
const router = express.Router();
const Contest = require('../models/Contest')
const Submission = require('../models/Submission')
const User = require('../models/User')
const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;
const Recipient = require("mailersend").Recipient;
const EmailParams = require("mailersend").EmailParams;
const MailerSend = require("mailersend").MailerSend;
const Sender = require("mailersend").Sender;
const mailersend = new MailerSend({
    apiKey: process.env.MAIL_API_KEY,
});

// Route for registering a new user
router.post('/registration', verifyToken, async (req, res) => {
    try {
        const { username, email, password } = req.body;

        // Send registration confirmation email
        await sendRegistrationEmail(email, username, password);

        res.json({ msg: 'Confirmation email sent.' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

router.post('/end-of-contest', verifyToken, async (req, res) => {
    try {
        const { contestId } = req.body;

        let contest = await Contest.findById(new ObjectId(contestId));
        if (!contest) {
            return res.status(400).json({ msg: 'Contest not found.' });
        }

        const submissions = await Submission.find({ contest: contest }).sort({ score: -1 });
        if (submissions.length === 0) {
            return res.status(400).json({ msg: 'No submissions found for this contest.' });
        }

        const winnerSubmission = submissions[0];
        const winnerUser = await User.findById(winnerSubmission.participant);
        if (!winnerUser) {
            return res.status(400).json({ msg: 'Winner not found.' });
        }

        const loserSubmissions = submissions.slice(1);
        const loserUsers = await Promise.all(loserSubmissions.map(async (loserSubmission) => {
            const user = await User.findById(loserSubmission.participant);
            if (!user) {
                return null;
            }
            return { user, score: loserSubmission.score };
        }));
        const validLoserUsers = loserUsers.filter(loser => loser !== null);

        const contestOwner = await User.findById(contest.owner);
        if (!contestOwner) {
            return res.status(400).json({ msg: 'Owner of the contest not found.' });
        }

        await sendEndScores(winnerUser, winnerSubmission.score, true);
        await Promise.all(validLoserUsers.map(async (loser) => {
            await sendEndScores(loser.user, loser.score, false);
        }));

        await sendScoresToOwner(contestOwner, winnerUser.username, winnerSubmission.score, validLoserUsers);

        res.json({ msg: 'Mails sent.' });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }

});

// Function to send registration confirmation email
async function sendRegistrationEmail(email, username, password) {
    try {
        const recipients = [new Recipient(email, username)];
        const sentFrom = new Sender(process.env.MAIL_SENDER, "Mayke en Charlotte");

        const emailParams = new EmailParams()
            .setFrom(sentFrom)
            .setTo(recipients)
            .setSubject("Confirmation registration")
            .setHtml('Your Photo Prestiges account is registered! \n' +
                'Username: ' + username + '\n' +
                'Password: ' + password);

        await mailersend.email.send(emailParams);
        console.log('Email sent!');
    } catch (error) {
        console.error('Error while sending the confirmation email:', error);
        throw new Error('Confirmation email not sent.');
    }
}

// Function to send an email to a participant with their score
async function sendEndScores(user, score, winner) {
    try {
        const recipients = [new Recipient(user.email, user.username)];
        const sentFrom = new Sender(process.env.MAIL_SENDER, "Mayke en Charlotte");

        let emailParams;
        if (!winner) {
            emailParams = new EmailParams()
                .setFrom(sentFrom)
                .setTo(recipients)
                .setSubject("End of contest")
                .setHtml('The contest has ended, you lost! :( \n' +
                    'Your score: ' + score);
        } else {
            emailParams = new EmailParams()
                .setFrom(sentFrom)
                .setTo(recipients)
                .setSubject("End of contest")
                .setHtml('The contest has ended, you won! :) \n' +
                    'Your score: ' + score);
        }

        await mailersend.email.send(emailParams);
        console.log('Email sent!');
    } catch (error) {
        console.error('Error while sending the score mail:', error);
        throw new Error('Score mail not sent');
    }
}

async function sendScoresToOwner(user, winnerUsername, winnerScore, losers) {
    try {
        const recipients = [new Recipient(user.email, user.username)];
        const sentFrom = new Sender(process.env.MAIL_SENDER, "Mayke en Charlotte");

        let losersHtml = '';
        for (const loser of losers) {
            losersHtml += `[username: ${loser.username}, score: ${loser.score}] <br>`;
        }

        const emailParams = new EmailParams()
            .setFrom(sentFrom)
            .setTo(recipients)
            .setSubject("End of contest")
            .setHtml(`The contest has ended! \n The winner: [username: ${winnerUsername}, score: ${winnerScore}] \n The losers: ${losersHtml}`)

        await mailersend.email.send(emailParams);
        console.log('Email sent!');
    } catch (error) {
        console.error('Error while sending the score mail to the targetOwner:', error);
        throw new Error('Score mail not sent to targetOwner.');
    }
}

// Middleware to check if the request is from the gateway
function verifyToken(req, res, next) {
    const token = req.header('Gateway');

    if (!token || token !== gatewayToken) {
        console.log('Unauthorized access detected.');
        return res.status(401).json({ msg: 'Unauthorized access.' });
    } else {
        console.log('Access granted.');
    }

    next();
}

module.exports = router;
