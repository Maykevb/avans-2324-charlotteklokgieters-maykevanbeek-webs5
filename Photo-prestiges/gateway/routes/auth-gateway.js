require('dotenv').config();

const express = require('express');
const router = express.Router();
const axios = require('axios');
const CircuitBreaker = require('opossum');
const authService    =  process.env.AUTHSERVICE
const gatewayToken = process.env.GATEWAY_TOKEN;
const options = {
    timeout: 3000, // Als onze functie langer dan 3 seconden duurt, wordt er een fout getriggerd
    errorThresholdPercentage: 50, // Wanneer 50% van de verzoeken mislukt, wordt de circuit onderbroken
    resetTimeout: 3000 // Na 3 seconden, probeer opnieuw.
};
const authCB = new CircuitBreaker(callService, options);

// Route voor het inloggen van een gebruiker
router.post('/login', (req, res) => {
    let credentials = req.body;
    if (!credentials) return res.status(400).send('Ongeldige inloggegevens.');

    authCB.fire('post', authService, '/auth/login', credentials, gatewayToken)
        .then(response => {
            res.send(response);
        })
        .catch(error => {
            console.error('Fout bij het inloggen:', error);
            res.status(500).send('Er is een fout opgetreden bij het inloggen.');
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
                console.error(`Fout tijdens het uitvoeren van het verzoek (${method.toUpperCase()} ${url}):`);
                reject(error);
            });
    });
}

authCB.fallback(() => {
    return 'Auth service momenteel niet beschikbaar. Probeer het later opnieuw.';
});

module.exports = router;
