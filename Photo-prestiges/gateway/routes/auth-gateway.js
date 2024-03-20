require('dotenv').config();

const express = require('express');
const router = express.Router();
const axios = require('axios');
const CircuitBreaker = require('opossum');
const authService    =  process.env.AUTHSERVICE
const options = {
    timeout: 3000, // If our function takes longer than 3 seconds, trigger a failure
    errorThresholdPercentage: 50, // When 50% of requests fail, trip the circuit
    resetTimeout: 3000 // After 3 seconds, try again.
};
const authCB = new CircuitBreaker(callService, options);
let serviceAddress = null;

router.post('/login', (req, res) => {
    let credentials = req.body;
    if (!credentials) return res.status(400).send('Ongeldige inloggegevens.');

    authCB.fire('post', authService, '/login', credentials)
        .then(response => {
            res.send(response);
        })
        .catch(error => {
            console.error('Fout bij het inloggen:', error);
            res.status(500).send('Er is een fout opgetreden bij het inloggen.');
        });
});

function callService(method,serviceAddress,resource,body){return new Promise(( resolve,reject )=>{
    serviceAddress = formatWithSlashes( serviceAddress );
    if( method === 'post' ){
        axios.post(`${ serviceAddress }${ resource }`,body )
            .then(( mess )=>{
                resolve( 'van authrouter : '+ mess.data);
            }).catch(( e )=>{
            console.log('Error door axios ' + e.toString())
            reject( 'Error tijdens request in axios');
        });

    }else{
        axios.get(`${serviceAddress}${resource}`)
            .then((mess)=>{
                resolve('van response authroute : ' + mess.data);
            })
    }
})
}

authCB.fallback(() => {
    return 'Auth service momenteel niet beschikbaar. Probeer het later opnieuw.';
});

function formatWithSlashes(serviceAddress){
    return (authService.endsWith('/'))? serviceAddress : '/';
}

module.exports = router;
