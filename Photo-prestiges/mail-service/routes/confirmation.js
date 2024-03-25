require('dotenv').config();

const express = require('express');
const router = express.Router();
const Recipient = require("mailersend").Recipient;
const EmailParams = require("mailersend").EmailParams;
const MailerSend = require("mailersend").MailerSend;
const Sender = require("mailersend").Sender;
const gatewayToken = process.env.GATEWAY_TOKEN;
const mailersend = new MailerSend({
    apiKey: process.env.MAIL_API_KEY,
});

// Route for registering a new user
router.post('/registration', verifyToken, async (req, res) => {
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

// Middleware om te controleren of het verzoek via de gateway komt
function verifyToken(req, res, next) {
    const token = req.header('Gateway');

    if (!token || token !== gatewayToken) {
        console.log('Unauthorized access detected.');
        return res.status(401).json({ msg: 'Ongeautoriseerde toegang' });
    } else {
        console.log('Access granted');
    }

    next();
}

// Function to send registration confirmation email
async function sendRegistrationEmail(email, username, password) {
    try {
        const recipients = [new Recipient(email, username)];
        const sentFrom = new Sender("MS_7c7Kz8@trial-k68zxl2e965lj905.mlsender.net", "Mayke en Charlotte");

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

module.exports = router;
