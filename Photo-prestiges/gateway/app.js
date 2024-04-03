require('dotenv').config({ path: '../.env' })

const express = require('express');
const app = express();
const port = process.env.GATEWAYPORT || 5000;
const registerRoute = require('./routes/register-gateway');
const authRoute = require('./routes/auth-gateway');
const contestRoute = require('./routes/contest-gateway');
const readRoutes = require('./routes/read-gateway');
const clockRoutes = require('./routes/clock-gateway');
const scoreRoutes = require('./routes/score-gateway');
const cors = require('cors');

const swaggerUI = require('swagger-ui-express')
const swaggerDocument = require('./swagger.json');
app.use('/api-docs', swaggerUI.serve, swaggerUI.setup(swaggerDocument));

app.use(cors())
app.use(express.json());

app.post('/register', registerRoute);
app.post('/login', authRoute);
app.post('/create-contest', contestRoute);
app.put('/update-contest', contestRoute);
app.delete('/delete-contest', contestRoute);
app.post('/register-for-contest', contestRoute);
app.put('/update-submission', contestRoute);
app.delete('/delete-submission', contestRoute);
app.delete('/delete-submission-as-owner', contestRoute);
app.put('/vote-for-contest', contestRoute);
app.get('/get-submission', contestRoute);
app.get('/get-all-submissions', contestRoute);
app.get('/get-contests', readRoutes);
app.get('/get-time', clockRoutes);

app.listen(port, () => {
    console.log('Server is up on port ' + port)
})
