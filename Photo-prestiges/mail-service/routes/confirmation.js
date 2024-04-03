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
router.post('/registration', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        // Send registration confirmation email
        await sendRegistrationEmail(email, username, password);

        res.json({ msg: 'Bevestigingsmail verzonden' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

router.post('/end-of-contest', async (req, res) => {
    try {
        const { contestId } = req.body;

        let contest = await Contest.findById(new ObjectId(contestId));
        if (!contest) {
            return res.status(400).json({ msg: 'Wedstrijd bestaat niet' });
        }

        const submissions = await Submission.find({ contest: contest }).sort({ score: -1 });
        if (submissions.length === 0) {
            return res.status(400).json({ msg: 'Geen inzendingen gevonden voor deze wedstrijd' });
        }

        const winnerSubmission = submissions[0];
        const winnerUser = await User.findById(winnerSubmission.participant);
        if (!winnerUser) {
            return res.status(400).json({ msg: 'Winnaar niet gevonden' });
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
            return res.status(400).json({ msg: 'Eigenaar van de wedstrijd niet gevonden' });
        }

        await sendEndScores(winnerUser, winnerSubmission.score, true);
        await Promise.all(validLoserUsers.map(async (loser) => {
            await sendEndScores(loser.user, loser.score, false);
        }));

        await sendScoresToOwner(contestOwner, winnerUser.username, winnerSubmission.score, validLoserUsers);

        res.json({ msg: 'Mails verzonden' });

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
            .setSubject("Bevestiging registratie")
            .setHtml('Je Photo Prestiges account is geregistreerd! \n' +
                'Gebruikersnaam: ' + username + '\n' +
                'Wachtwoord: ' + password);

        await mailersend.email.send(emailParams);
        console.log('Email verzonden!');
    } catch (error) {
        console.error('Error bij het verzenden van de bevestigingsmail:', error);
        throw new Error('Bevestigingsmail niet verzonden');
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
                .setSubject("Einde van wedstrijd")
                .setHtml('De wedstrijd is afgelopen, je hebt verloren! \n' +
                    'Jouw eindscore: ' + score);
        } else {
            emailParams = new EmailParams()
                .setFrom(sentFrom)
                .setTo(recipients)
                .setSubject("Einde van wedstrijd")
                .setHtml('De wedstrijd is afgelopen, je hebt gewonnen! \n' +
                    'Jouw eindscore: ' + score);
        }

        await mailersend.email.send(emailParams);
        console.log('Email verzonden!');
    } catch (error) {
        console.error('Error bij het verzenden van de score mail:', error);
        throw new Error('Eindscore mail niet verzonden');
    }
}

async function sendScoresToOwner(user, winnerUsername, winnerScore, losers) {
    try {
        const recipients = [new Recipient(user.email, user.username)];
        const sentFrom = new Sender(process.env.MAIL_SENDER, "Mayke en Charlotte");

        let losersHtml = '';
        for (const loser of losers) {
            losersHtml += `[gebruikersnaam: ${loser.username}, score: ${loser.score}] <br>`;
        }

        const emailParams = new EmailParams()
            .setFrom(sentFrom)
            .setTo(recipients)
            .setSubject("Einde van wedstrijd")
            .setHtml(`De wedstrijd is afgelopen! \n De winnaar: [gebruikersnaam: ${winnerUsername}, score: ${winnerScore}] \n De verliezers: ${losersHtml}`)

        await mailersend.email.send(emailParams);
        console.log('Email verzonden!');
    } catch (error) {
        console.error('Error bij het verzenden van de score mail:', error);
        throw new Error('Eindscore mail niet verzonden');
    }
}

module.exports = router;
