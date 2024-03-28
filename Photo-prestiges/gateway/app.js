const express = require('express');
const app = express();
const port = process.env.PORT || 5000;
const registerRoute = require('./routes/register-gateway');
const authRoute = require('./routes/auth-gateway');
const contestRoute = require('./routes/contest-gateway');
const readRoutes = require('./routes/read-gateway');
const cors = require('cors');

const swaggerUI = require('swagger-ui-express')
const swaggerDocument = require('./swagger.json');
app.use('/api-docs', swaggerUI.serve, swaggerUI.setup(swaggerDocument));

app.use(cors())
app.use(express.json());

app.post('/register', registerRoute);
app.post('/login', authRoute);
app.post('/create-contest', contestRoute);
app.post('/update-contest', contestRoute);
app.post('/register-for-contest', contestRoute);
app.post('/update-submission', contestRoute);

app.get('/get-contests', readRoutes);

app.listen(port, () => {
    console.log('Server is up on port ' + port)
})
