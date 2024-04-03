require('dotenv').config({ path: '../.env' })

const express = require('express');
const router = express.Router();
const axios = require('axios');
const CircuitBreaker = require('opossum');
const clockService = process.env.CLOCKSERVICE;
const gatewayToken = process.env.GATEWAY_TOKEN;
const options = {
    timeout: 3000, // Als de functie langer dan 3 seconden duurt, wordt er een fout getriggerd
    errorThresholdPercentage: 50, // Wanneer 50% van de verzoeken mislukt, wordt de circuit onderbroken
    resetTimeout: 3000 // Na 3 seconden, probeer opnieuw.
};
const clockCB = new CircuitBreaker(callService, options);

// Route voor het ophalen van de resterende tijd van een wedstrijd
router.get('/get-time', verifyToken, (req, res) => {
    const { contestId } = req.query;

    clockCB.fire('get', clockService, `/contests/get?contestId=${contestId}`)
        .then(response => {
            res.send(response);
        })
        .catch(error => {
            console.error('Fout bij het ophalen van de resterende tijd:', error);
            res.status(500).send('Er is een fout opgetreden bij het ophalen van de resterende tijd.');
        });
});

function verifyToken(req, res, next) {
    const token = req.header('authorization');

    if (!token) {
        return res.status(401).send('Geen JWT-token verstrekt');
    }

    next();
}

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

clockCB.fallback((method, serviceAddress, resource, data, gateway, error) => {
    if (error && error.status !== undefined && error.statusText  !== undefined && error.data !== undefined && error.data.msg !== undefined)  {
        const status = error.status || 'Onbekend';
        const statusText = error.statusText || 'Onbekend';
        const errorMsg = error.data.msg || 'Geen foutbericht beschikbaar';

        console.error(`Fout bij het uitvoeren van het verzoek (${method.toUpperCase()} ${serviceAddress}${resource}):`, status, statusText, errorMsg);

        return `Oopsie, er ging iets mis. Fout: ${status} - ${statusText} - ${errorMsg}. Probeer het later opnieuw.`;
    } else {
        console.error(`Fout bij het uitvoeren van het verzoek (${method.toUpperCase()} ${serviceAddress}${resource})`);
    }

    return "De clock service is offline. Probeer het later nog eens.";
});

module.exports = router;
