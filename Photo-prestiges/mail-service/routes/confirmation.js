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

// Function to send registration confirmation email
async function sendRegistrationEmail(email, username, password) {
    try {
        const recipients = [new Recipient(email, username)];
        const sentFrom = new Sender("MS_BG0VX6@trial-3zxk54vnw5xljy6v.mlsender.net", "Mayke en Charlotte");

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
