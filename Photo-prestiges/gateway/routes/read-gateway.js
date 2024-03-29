require('dotenv').config();

const express = require('express');
const router = express.Router();
const axios = require('axios');
const CircuitBreaker = require('opossum');
const readService = process.env.READSERVICE;
const gatewayToken = process.env.GATEWAY_TOKEN;
const options = {
    timeout: 3000, // Als de functie langer dan 3 seconden duurt, wordt er een fout getriggerd
    errorThresholdPercentage: 50, // Wanneer 50% van de verzoeken mislukt, wordt de circuit onderbroken
    resetTimeout: 3000 // Na 3 seconden, probeer opnieuw.
};
const contestCB = new CircuitBreaker(callService, options);

// Route voor het ophalen van een wedstrijden overzicht
router.get('/get-contests', verifyToken, (req, res) => {
    const { page = 1, limit = 10, statusOpen = true } = req.query;

    const queryParams = {
        page: page,
        limit: limit,
        statusOpen: statusOpen
    };
    console.log(queryParams)

    contestCB.fire('get', readService, `/contests/get?page=${page}&limit=${limit}&statusOpen=${statusOpen}`)
        .then(response => {
            res.send(response);
        })
        .catch(error => {
            console.error('Fout bij het ophalen van de wedstrijden:', error);
            res.status(500).send('Er is een fout opgetreden bij het ophalen van de wedstrijden.');
        });
});

function verifyToken(req, res) {
    const token = req.header('authorization');

    if (!token) {
        return res.status(401).send('Geen JWT-token verstrekt');
    }
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

    return "De read service is offline. Probeer het later nog eens.";
});

module.exports = router;
