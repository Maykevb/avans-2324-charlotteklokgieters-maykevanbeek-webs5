require('dotenv').config();

const express = require('express');
const router = express.Router();
const axios = require('axios');
const CircuitBreaker = require('opossum');
const contestService = process.env.CONTESTSERVICE;
const gatewayToken = process.env.GATEWAY_TOKEN;
const options = {
    timeout: 3000, // Als de functie langer dan 3 seconden duurt, wordt er een fout getriggerd
    errorThresholdPercentage: 50, // Wanneer 50% van de verzoeken mislukt, wordt de circuit onderbroken
    resetTimeout: 3000 // Na 3 seconden, probeer opnieuw.
};
const contestCB = new CircuitBreaker(callService, options);
const jwt = require('jsonwebtoken');

// Route voor het aanmaken van een nieuwe wedstrijd
router.post('/create-contest', verifyTokenTarget, (req, res) => {
    let contestData = req.body;
    if (!contestData || !contestData.endTime) {
        return res.status(400).send('Ongeldige gegevens voor het aanmaken van een wedstrijd.');
    }

    contestData.user = req.user.username;

    contestCB.fire('post', contestService, '/contests/create', contestData, gatewayToken)
        .then(response => {
            res.send(response);
        })
        .catch(error => {
            console.error('Fout bij het aanmaken van een contest:', error);
            res.status(500).send('Er is een fout opgetreden bij het aanmaken van een contest.');
        });
});

router.post('/update-contest', verifyTokenTarget, (req, res) => {
    let contestData = req.body;
    if (!contestData || !contestData.id || !contestData.place || !contestData.image) {
        return res.status(400).send('Ongeldige gegevens voor het updaten van een wedstrijd.');
    }

    contestData.user = req.user.username;

    contestCB.fire('post', contestService, '/contests/update', contestData, gatewayToken)
        .then(response => {
            res.send(response);
        })
        .catch(error => {
            console.error('Fout bij het updaten van een wedstrijd:', error);
            res.status(500).send('Er is een fout opgetreden bij het updaten van een wedstrijd.');
        });
});

// Route voor het aanmelden voor een wedstrijd als participant
router.post('/register-for-contest', verifyTokenParticipant, (req, res) => {
    let contestData = req.body;
    if (!contestData || !contestData.contestId) {
        return res.status(400).send('Ongeldige gegevens voor het aanmelden bij een wedstrijd.');
    }

    contestData.user = req.user.username;

    contestCB.fire('post', contestService, '/contests/register', contestData, gatewayToken)
        .then(response => {
            res.send(response);
        })
        .catch(error => {
            console.error('Fout bij het aanmelden voor een wedstrijd:', error);
            res.status(500).send('Er is een fout opgetreden bij het aanmelden voor een wedstrijd.');
        });
});

function callService(method, serviceAddress, resource, data) {
    return new Promise((resolve, reject) => {
        let url = `${serviceAddress}${resource}`;

        const headers = {
            'Gateway': `${gatewayToken}`,
            'Content-Type': 'application/json'
        };

        axios({
            method: method,
            url: url,
            headers: headers,
            data: data
        })
            .then(response => {
                resolve(response.data);
            })
            .catch(error => {
                reject(error.response);
            });
    });
}

function verifyTokenTarget(req, res, next) {
    const token = req.header('authorization').replace('Bearer ', '');

    if (!token) {
        return res.status(401).send('Geen JWT-token verstrekt');
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET_TARGETOWNER);
        req.user = decoded.user;
        next();
    } catch (error) {
        console.log(error)
        return res.status(401).send('Ongeldige JWT-token');
    }
}

function verifyTokenParticipant(req, res, next) {
    const token = req.header('authorization').replace('Bearer ', '');

    if (!token) {
        return res.status(401).send('Geen JWT-token verstrekt');
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET_PARTICIPANT);
        req.user = decoded.user;
        next();
    } catch (error) {
        console.log(error)
        return res.status(401).send('Ongeldige JWT-token');
    }
}

contestCB.fallback((method, serviceAddress, resource, data, gateway, error) => {
    if(error && error.status !== undefined && error.statusText  !== undefined && error.data !== undefined && error.data.msg !== undefined)  {
        const status = error.status || 'Onbekend';
        const statusText = error.statusText || 'Onbekend';
        const errorMsg = error.data.msg || 'Geen foutbericht beschikbaar';

        console.error(`Fout bij het uitvoeren van het verzoek (${method.toUpperCase()} ${serviceAddress}${resource}):`, status, statusText, errorMsg);

        return `Oopsie, er ging iets mis. Fout: ${status} - ${statusText} - ${errorMsg}. Probeer het later opnieuw.`;
    } else {
        console.error(`Fout bij het uitvoeren van het verzoek (${method.toUpperCase()} ${serviceAddress}${resource})`);
    }

    return "De contest service is offline. Probeer het later nog eens.";
});

module.exports = router;
