require('dotenv').config({ path: '../.env' })

const express = require('express');
const router = express.Router();
const axios = require('axios');
const CircuitBreaker = require('opossum');
const clockService = process.env.CLOCKSERVICE;
const gatewayToken = process.env.GATEWAY_TOKEN;
const options = {
    timeout: 3000, // If the function takes longer than 3 seconds, an error gets triggered
    errorThresholdPercentage: 50, // When 50% of the requests fail, the circuit gets interrupted
    resetTimeout: 3000 // After 3 seconds, try again
};
const clockCB = new CircuitBreaker(callService, options);

// Route for retrieving the remaining time of a contest
router.get('/get-time', verifyToken, (req, res) => {
    const { contestId } = req.query;

    clockCB.fire('get', clockService, `/contests/get?contestId=${contestId}`)
        .then(response => {
            res.send(response);
        })
        .catch(error => {
            console.error('Error while retrieving the remaining time:', error);
            res.status(500).send('An error occurred while retrieving the remaining time.');
        });
});

function verifyToken(req, res, next) {
    const token = req.header('authorization');

    if (!token) {
        return res.status(401).send('No JWT-token provided.');
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
        const status = error.status || 'Unknown';
        const statusText = error.statusText || 'Unknown';
        const errorMsg = error.data.msg || 'No errormessage available';

        console.error(`Error while trying to process the request (${method.toUpperCase()} ${serviceAddress}${resource}):`, status, statusText, errorMsg);
        return `Oopsie, Something went wrong :(. Error: ${status} - ${statusText} - ${errorMsg}. Try again later.`;
    } else {
        console.error(`Error while trying to process the request (${method.toUpperCase()} ${serviceAddress}${resource})`);
    }

    return "The clock service is offline. Try again later.";
});

module.exports = router;
