require('dotenv').config();

const express = require('express');
const router = express.Router();
const axios = require('axios');
const CircuitBreaker = require('opossum');
const registerService = process.env.REGISTERSERVICE;
const gatewayToken = process.env.GATEWAY_TOKEN;
const options = {
    timeout: 3000, // If our function takes longer than 3 seconds, trigger a failure
    errorThresholdPercentage: 50, // When 50% of requests fail, trip the circuit
    resetTimeout: 3000 // After 3 seconds, try again.
};
const registerCB = new CircuitBreaker(callService, options);

router.post('/register', (req, res) => {
    let userData = req.body;
    if (!userData) return res.status(400).send('Ongeldige gegevens voor registratie.');

    registerCB.fire('post', registerService, '/api/users/register', userData, gatewayToken)
        .then(response => {
            res.send(response);
        })
        .catch(error => {
            console.error('Fout bij het registreren van gebruiker:', error);
            res.status(500).send('Er is een fout opgetreden bij het registreren van de gebruiker.');
        });
});

function callService(method, serviceAddress, resource, data, token) {
    return new Promise((resolve, reject) => {
        let url = `${serviceAddress}${resource}`;

        const headers = {
            'Authorization': `Bearer ${token}`,
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
                console.error(`Fout tijdens het uitvoeren van het verzoek (${method.toUpperCase()} ${url}):`, error);
                reject(error);
            });
    });
}


registerCB.fallback(() => {
    return 'Register service momenteel niet beschikbaar. Probeer het later opnieuw.';
});

module.exports = router;
