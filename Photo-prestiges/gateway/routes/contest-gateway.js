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

router.put('/update-contest', verifyTokenTarget, upload.single('image'), (req, res) => {
    let contestData = req.body;
    if (!contestData || !contestData.id || !contestData.place || !req.file) {
        return res.status(400).send('Ongeldige gegevens voor het updaten van een wedstrijd.');
    }

    contestData.user = req.user.username;
    contestData.image = req.file;

    contestCB.fire('put', contestService, '/contests/updateContest', contestData, gatewayToken)
        .then(response => {
            res.contentType('multipart/form-data')
            res.send(response);
        })
        .catch(error => {
            console.error('Fout bij het updaten van een wedstrijd:', error);
            res.status(500).send('Er is een fout opgetreden bij het updaten van een wedstrijd.');
        });
});

router.delete('/delete-contest', verifyTokenTarget, (req, res) => {
    let contestData = req.body;
    if (!contestData || !contestData.contestId ) {
        return res.status(400).send('Ongeldige gegevens voor het updaten van een wedstrijd.');
    }

    contestData.user = req.user.username;

    contestCB.fire('delete', contestService, '/contests/deleteContest', contestData, gatewayToken)
        .then(response => {
            res.send(response);
        })
        .catch(error => {
            console.error('Fout bij het verwijderen van een wedstrijd:', error);
            res.status(500).send('Er is een fout opgetreden bij het verwijderen van een wedstrijd.');
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

router.put('/update-submission', verifyTokenParticipant, upload.single('image'), (req, res) => {
    let submissionData = req.body;
    if (!submissionData || !submissionData.submissionId || !req.file) {
        return res.status(400).send('Ongeldige gegevens voor het updaten van een submission.');
    }

    submissionData.user = req.user.username;
    submissionData.image = req.file;

    contestCB.fire('put', contestService, '/contests/updateSubmission', submissionData, gatewayToken)
        .then(response => {
            res.contentType('multipart/form-data')
            res.send(response);
        })
        .catch(error => {
            console.error('Fout bij het updaten van een submission:', error);
            res.status(500).send('Er is een fout opgetreden bij het updaten van een submission.');
        });
});

router.delete('/delete-submission', verifyTokenParticipant, (req, res) => {
    let submissionData = req.body;
    if (!submissionData || !submissionData.submissionId) {
        return res.status(400).send('Ongeldige gegevens voor het verwijderen van een submission.');
    }

    submissionData.user = req.user.username;

    contestCB.fire('delete', contestService, '/contests/deleteSubmission', submissionData, gatewayToken)
        .then(response => {
            res.send(response);
        })
        .catch(error => {
            console.error('Fout bij het verwijderen van een submission:', error);
            res.status(500).send('Er is een fout opgetreden bij het verwijderen van een submission.');
        });
});

router.delete('/delete-submission-as-owner', verifyTokenTarget, (req, res) => {
    let submissionData = req.body;
    if (!submissionData || !submissionData.submissionId) {
        return res.status(400).send('Ongeldige gegevens voor het verwijderen van een submission.');
    }

    submissionData.user = req.user.username;

    contestCB.fire('delete', contestService, '/contests/deleteSubmissionAsOwner', submissionData, gatewayToken)
        .then(response => {
            res.send(response);
        })
        .catch(error => {
            console.error('Fout bij het verwijderen van een submission:', error);
            res.status(500).send('Er is een fout opgetreden bij het verwijderen van een submission.');
        });
});

router.put('/vote-for-contest', verifyTokenParticipant, (req, res) => {
    let contestData = req.body;
    if (!contestData || !contestData.contestId) {
        return res.status(400).send('Ongeldige gegevens voor het stemmen voor een wedstrijd.');
    }

    contestData.user = req.user.username;

    contestCB.fire('put', contestService, '/contests/vote', contestData, gatewayToken)
        .then(response => {
            res.send(response);
        })
        .catch(error => {
            console.error('Fout bij het stemmen voor een wedstrijd:', error);
            res.status(500).send('Er is een fout opgetreden bij het stemmen voor een wedstrijd.');
        });
});

router.get('/get-submission', verifyTokenParticipant, (req, res) => {
    const { submissionId } = req.query;
    if (!submissionId) {
        return res.status(400).send('You have to give along a submissionId.');
    }

    let submissionData = req.body;
    submissionData.user = req.user.username;

    contestCB.fire('get', contestService, `/contests/getSubmission?submissionId=${submissionId}`, submissionData)
        .then(response => {
            res.send(response);
        })
        .catch(error => {
            console.error('Fout bij het ophalen van submission:', error);
            res.status(500).send('Er is een fout opgetreden bij het ophalen van de submission.');
        });
});

router.get('/get-all-submissions', verifyTokenTarget, (req, res) => {
    const { contestId, page = 1, limit = 10 } = req.query;
    if (!contestId) {
        return res.status(400).send('You have to give along a contestId.');
    }

    let contestData = req.body;
    contestData.user = req.user.username;

    contestCB.fire('get', contestService, `/contests/getAllSubmissions?contestId=${contestId}&page=${page}&limit=${limit}`, contestData)
        .then(response => {
            res.send(response);
        })
        .catch(error => {
            console.error('Fout bij het ophalen van de submissions:', error);
            res.status(500).send('Er is een fout opgetreden bij het ophalen van de submissions.');
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
        return res.status(401).send('Geen JWT-token verstrekt');
    }

    const token = tokenHeader.replace('Bearer ', '');

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
    const tokenHeader = req.header('authorization');

    if (!tokenHeader) {
        return res.status(401).send('Geen JWT-token verstrekt');
    }

    const token = tokenHeader.replace('Bearer ', '');

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
    if (error && error.status !== undefined && error.statusText  !== undefined && error.data !== undefined && error.data.msg !== undefined)  {
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
