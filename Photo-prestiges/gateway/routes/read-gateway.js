require('dotenv').config({ path: '../.env' })

const express = require('express');
const router = express.Router();
const axios = require('axios');
const CircuitBreaker = require('opossum');
const readService = process.env.READSERVICE;
const gatewayToken = process.env.GATEWAY_TOKEN;
const options = {
    timeout: 3000, // If the function takes longer than 3 seconds, an error gets triggered
    errorThresholdPercentage: 50, // When 50% of the requests fail, the circuit gets interrupted
    resetTimeout: 3000 // After 3 seconds, try again
};
const readCB = new CircuitBreaker(callService, options);

// Route for retrieving an overview of all contests
router.get('/get-contests', verifyToken, (req, res) => {
    const { page = 1, limit = 10, statusOpen = true } = req.query;

    readCB.fire('get', readService, `/read/get?page=${page}&limit=${limit}&statusOpen=${statusOpen}`)
        .then(response => {
            res.send(response);
        })
        .catch(error => {
            console.error('Error while retrieving the contests:', error);
            res.status(500).send('An error occurred while retrieving the contests.');
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

readCB.fallback((method, serviceAddress, resource, data, gateway, error) => {
    if (error && error.status !== undefined && error.statusText  !== undefined && error.data !== undefined && error.data.msg !== undefined)  {
        const status = error.status || 'Unknown';
        const statusText = error.statusText || 'Unknown';
        const errorMsg = error.data.msg || 'No errormessage available';

        console.error(`Error while trying to process the request (${method.toUpperCase()} ${serviceAddress}${resource}):`, status, statusText, errorMsg);
        return `Oopsie, Something went wrong :(. Error: ${status} - ${statusText} - ${errorMsg}. Try again later.`;
    } else {
        console.error(`Error while trying to process the request (${method.toUpperCase()} ${serviceAddress}${resource})`);
    }

    return "The read service is offline. Try again later.";
});

module.exports = router;
