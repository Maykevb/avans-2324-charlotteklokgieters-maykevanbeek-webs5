require('dotenv').config({ path: '../.env' })

const express = require('express');
const router = express.Router();
const axios = require('axios');
const multer = require('multer');
const upload = multer();
const CircuitBreaker = require('opossum');
const contestService = process.env.CONTESTSERVICE;
const gatewayToken = process.env.GATEWAY_TOKEN;
const options = {
    timeout: 3000, // If the function takes longer than 3 seconds, an error gets triggered
    errorThresholdPercentage: 50, // When 50% of the requests fail, the circuit gets interrupted
    resetTimeout: 3000 // After 3 seconds, try again
};
const contestCB = new CircuitBreaker(callService, options);
const jwt = require('jsonwebtoken');

// Route for creating a new contest
router.post('/create-contest', verifyTokenTarget, (req, res) => {
    let contestData = req.body;
    if (!contestData || !contestData.endTime) {
        return res.status(400).send('Invalid data for creating a contest.');
    }

    contestData.user = req.user.username;

    contestCB.fire('post', contestService, '/contests/create', contestData, gatewayToken)
        .then(response => {
            res.send(response);
        })
        .catch(error => {
            console.error('Error while creating a contest:', error);
            res.status(500).send('An error occurred while creating a contest.');
        });
});

router.put('/update-contest', verifyTokenTarget, upload.single('image'), (req, res) => {
    let contestData = req.body;
    if (!contestData || !contestData.id || !contestData.place || !req.file) {
        return res.status(400).send('Invalid data for updating a contest.');
    }

    contestData.user = req.user.username;
    contestData.image = req.file;

    contestCB.fire('put', contestService, '/contests/updateContest', contestData, gatewayToken)
        .then(response => {
            res.contentType('multipart/form-data')
            res.send(response);
        })
        .catch(error => {
            console.error('Error while updating a contest:', error);
            res.status(500).send('An error occurred while updating a contest.');
        });
});

router.delete('/delete-contest', verifyTokenTarget, (req, res) => {
    let contestData = req.body;
    if (!contestData || !contestData.contestId ) {
        return res.status(400).send('Invalid data for deleting a contest.');
    }

    contestData.user = req.user.username;

    contestCB.fire('delete', contestService, '/contests/deleteContest', contestData, gatewayToken)
        .then(response => {
            res.send(response);
        })
        .catch(error => {
            console.error('Error while deleting a contest:', error);
            res.status(500).send('An error occurred while deleting a contest.');
        });
});

// Route for registering for a contest as a participant
router.post('/register-for-contest', verifyTokenParticipant, (req, res) => {
    let contestData = req.body;
    if (!contestData || !contestData.contestId) {
        return res.status(400).send('Invalid data for registering for a contest.');
    }

    contestData.user = req.user.username;

    contestCB.fire('post', contestService, '/contests/register', contestData, gatewayToken)
        .then(response => {
            res.send(response);
        })
        .catch(error => {
            console.error('Error while entering a contest:', error);
            res.status(500).send('An error occurred while entering a contest.');
        });
});

router.put('/update-submission', verifyTokenParticipant, upload.single('image'), (req, res) => {
    let submissionData = req.body;
    if (!submissionData || !submissionData.submissionId || !req.file) {
        return res.status(400).send('Invalid data for updating a submission.');
    }

    submissionData.user = req.user.username;
    submissionData.image = req.file;

    contestCB.fire('put', contestService, '/contests/updateSubmission', submissionData, gatewayToken)
        .then(response => {
            res.contentType('multipart/form-data')
            res.send(response);
        })
        .catch(error => {
            console.error('Error while updating a submission:', error);
            res.status(500).send('An error occurred while updating a submission.');
        });
});

router.delete('/delete-submission', verifyTokenParticipant, (req, res) => {
    let submissionData = req.body;
    if (!submissionData || !submissionData.submissionId) {
        return res.status(400).send('Invalid data for deleting a submission.');
    }

    submissionData.user = req.user.username;

    contestCB.fire('delete', contestService, '/contests/deleteSubmission', submissionData, gatewayToken)
        .then(response => {
            res.send(response);
        })
        .catch(error => {
            console.error('Error while deleting a submission:', error);
            res.status(500).send('An error occurred while deleting a submission.');
        });
});

router.delete('/delete-submission-as-owner', verifyTokenTarget, (req, res) => {
    let submissionData = req.body;
    if (!submissionData || !submissionData.submissionId) {
        return res.status(400).send('Invalid data for deleting a submission.');
    }

    submissionData.user = req.user.username;

    contestCB.fire('delete', contestService, '/contests/deleteSubmissionAsOwner', submissionData, gatewayToken)
        .then(response => {
            res.send(response);
        })
        .catch(error => {
            console.error('Error while deleting a submission:', error);
            res.status(500).send('An error occurred while deleting a submission.');
        });
});

router.put('/vote-for-contest', verifyTokenParticipant, (req, res) => {
    let contestData = req.body;
    if (!contestData || !contestData.contestId) {
        return res.status(400).send('Invalid data for voting for a contest.');
    }

    contestData.user = req.user.username;

    contestCB.fire('put', contestService, '/contests/vote', contestData, gatewayToken)
        .then(response => {
            res.send(response);
        })
        .catch(error => {
            console.error('Error while voting for a contest:', error);
            res.status(500).send('An error occurred while voting for a contest.');
        });
});

router.get('/get-submission', verifyTokenParticipant, (req, res) => {
    const { submissionId } = req.query;
    if (!submissionId) {
        return res.status(400).send('Invalid data for getting a view of a submission.');
    }

    let submissionData = req.body;
    submissionData.user = req.user.username;

    contestCB.fire('get', contestService, `/contests/getSubmission?submissionId=${submissionId}`, submissionData)
        .then(response => {
            res.send(response);
        })
        .catch(error => {
            console.error('Error while retrieving submission:', error);
            res.status(500).send('An error occurred while retrieving submission.');
        });
});

router.get('/get-all-submissions', verifyTokenTarget, (req, res) => {
    const { contestId, page = 1, limit = 10 } = req.query;
    if (!contestId) {
        return res.status(400).send('Invalid data for getting an overview of all submissions of a contest.');
    }

    let contestData = req.body;
    contestData.user = req.user.username;

    contestCB.fire('get', contestService, `/contests/getAllSubmissions?contestId=${contestId}&page=${page}&limit=${limit}`, contestData)
        .then(response => {
            res.send(response);
        })
        .catch(error => {
            console.error('Error while retrieving submissions:', error);
            res.status(500).send('An error occurred while retrieving submissions.');
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
    const tokenHeader = req.header('authorization');

    if (!tokenHeader) {
        return res.status(401).send('No JWT-token provided.');
    }

    const token = tokenHeader.replace('Bearer ', '');

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET_TARGETOWNER);
        req.user = decoded.user;
        next();
    } catch (error) {
        console.log(error)
        return res.status(401).send('Invalid JWT-token.');
    }
}

function verifyTokenParticipant(req, res, next) {
    const tokenHeader = req.header('authorization');

    if (!tokenHeader) {
        return res.status(401).send('No JWT-token provided.');
    }

    const token = tokenHeader.replace('Bearer ', '');

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET_PARTICIPANT);
        req.user = decoded.user;
        next();
    } catch (error) {
        console.log(error)
        return res.status(401).send('Invalid JWT-token.');
    }
}

contestCB.fallback((method, serviceAddress, resource, data, gateway, error) => {
    if (error && error.status !== undefined && error.statusText  !== undefined && error.data !== undefined && error.data.msg !== undefined)  {
        const status = error.status || 'Unknown';
        const statusText = error.statusText || 'Unknown';
        const errorMsg = error.data.msg || 'No errormessage available';

        console.error(`Error while trying to process the request (${method.toUpperCase()} ${serviceAddress}${resource}):`, status, statusText, errorMsg);
        return `Oopsie, Something went wrong :(. Error: ${status} - ${statusText} - ${errorMsg}. Try again later.`;
    } else {
        console.error(`Error while trying to process the request (${method.toUpperCase()} ${serviceAddress}${resource})`);
    }


    return "The contest service is offline. Try again later.";
});

module.exports = router;
