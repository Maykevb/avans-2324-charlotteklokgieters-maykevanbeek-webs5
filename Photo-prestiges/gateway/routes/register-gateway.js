require('dotenv').config({ path: '../.env' })

const express = require('express');
const router = express.Router();
const axios = require('axios');
const CircuitBreaker = require('opossum');
const registerService = process.env.REGISTERSERVICE;
const gatewayToken = process.env.GATEWAY_TOKEN;
const options = {
    timeout: 3000, // If the function takes longer than 3 seconds, an error gets triggered
    errorThresholdPercentage: 50, // When 50% of the requests fail, the circuit gets interrupted
    resetTimeout: 3000 // After 3 seconds, try again
};
const registerCB = new CircuitBreaker(callService, options);

// Route for registering a new user
router.post('/register', (req, res) => {
    let userData = req.body;
    const validRoles = ['participant', 'targetOwner']
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!userData || !userData.username || !userData.email || !userData.password || !userData.role || !validRoles.includes(userData.role) || !emailRegex.test(userData.email)) {
        return res.status(400).send('Invalid data to register a new user.');
    }

    registerCB.fire('post', registerService, '/users/register', userData, gatewayToken)
        .then(response => {
            res.send(response);
        })
        .catch(error => {
            console.error('Error while creating new user:', error);
            res.status(500).send('An error occurred while creating a new user.');
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

registerCB.fallback((method, serviceAddress, resource, data, gateway, error) => {
    if (error && error.status !== undefined && error.statusText  !== undefined && error.data !== undefined && error.data.msg !== undefined)  {
        const status = error.status || 'Unknown';
        const statusText = error.statusText || 'Unknown';
        const errorMsg = error.data.msg || 'No errormessage available';

        console.error(`Error while trying to process the request (${method.toUpperCase()} ${serviceAddress}${resource}):`, status, statusText, errorMsg);
        return `Oopsie, Something went wrong :(. Error: ${status} - ${statusText} - ${errorMsg}. Try again later.`;
    } else {
        console.error(`Error while trying to process the request (${method.toUpperCase()} ${serviceAddress}${resource})`);
    }

    return "The register service is offline. Try again later.";
});

module.exports = router;
