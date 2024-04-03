require('dotenv').config({ path: '../.env' })

const express = require('express');
const router = express.Router();
const axios = require('axios');
const CircuitBreaker = require('opossum');
const authService    =  process.env.AUTHSERVICE
const gatewayToken = process.env.GATEWAY_TOKEN;
const options = {
    timeout: 3000, // If the function takes longer than 3 seconds, an error gets triggered
    errorThresholdPercentage: 50, // When 50% of the requests fail, the circuit gets interrupted
    resetTimeout: 3000 // After 3 seconds, try again
};
const authCB = new CircuitBreaker(callService, options);

// Route for logging in as an existing user
router.post('/login', (req, res) => {
    let credentials = req.body;
    if (!credentials || !credentials.username || !credentials.password) {
        return res.status(400).send('Invalid login credentials.');
    }

    authCB.fire('post', authService, '/auth/login', credentials, gatewayToken)
        .then(response => {
            res.send(response);
        })
        .catch(error => {
            console.error('Error while logging in:', error);
            res.status(500).send('An error occurred while trying to log in.');
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

authCB.fallback((method, serviceAddress, resource, data, gateway, error) => {
    if (error && error.status !== undefined && error.statusText  !== undefined && error.data !== undefined && error.data.msg !== undefined)  {
        const status = error.status || 'Unknown';
        const statusText = error.statusText || 'Unknown';
        const errorMsg = error.data.msg || 'No errormessage available';

        console.error(`Error while processing the request (${method.toUpperCase()} ${serviceAddress}${resource}):`, status, statusText, errorMsg);
        return `Oopsie, something went wrong :(. Error: ${status} - ${statusText} - ${errorMsg}. Try again later.`;
    } else {
        console.error(`Error while processing the request (${method.toUpperCase()} ${serviceAddress}${resource})`);
    }

    return "The auth service is offline. Try again later.";
});


module.exports = router;
