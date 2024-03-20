require('dotenv').config();

const express = require('express');
const router = express.Router();
const axios = require('axios');
const CircuitBreaker = require('opossum');
const registerService = process.env.REGISTERSERVICE
const options = {
    timeout: 3000, // If our function takes longer than 3 seconds, trigger a failure
    errorThresholdPercentage: 50, // When 50% of requests fail, trip the circuit
    resetTimeout: 3000 // After 3 seconds, try again.
};
const registerCB = new CircuitBreaker(callService, options);
let serviceAddress = null;

router.post('/register', (req, res) => {
    let userData = req.body;
    if (!userData) return res.status(400).send('Ongeldige gegevens voor registratie.');

    registerCB.fire('post', registerService, '/register', userData)
        .then(response => {
            res.send(response);
        })
        .catch(error => {
            console.error('Fout bij het registreren van gebruiker:', error);
            res.status(500).send('Er is een fout opgetreden bij het registreren van de gebruiker.');
        });
});

function callService(method,serviceAddress,resource,body){return new Promise(( resolve,reject )=>{
    serviceAddress = formatWithSlashes( serviceAddress );
    if( method === 'post' ){
        axios.post(`${ serviceAddress }${ resource }`,body )
            .then(( mess )=>{
                resolve( 'van registerrouter : '+ mess.data);
            }).catch(( e )=>{
            console.log('Error door axios ' + e.toString())
            reject( 'Error tijdens request in axios');
        });

    }else{
        axios.get(`${serviceAddress}${resource}`)
            .then((mess)=>{
                resolve('van response registerroute : ' + mess.data);
            })
    }
})
}

registerCB.fallback(() => {
    return 'Register service momenteel niet beschikbaar. Probeer het later opnieuw.';
});

function formatWithSlashes(serviceAddress){
    return (registerService.endsWith('/'))? serviceAddress : '/';
}

module.exports = router;
