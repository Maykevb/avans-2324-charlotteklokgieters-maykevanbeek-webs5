const express = require('express');
const app = express();
const port = process.env.PORT || 5000;
const registerRoute = require('./routes/register-gateway');
const authRoute = require('./routes/auth-gateway');
const cors = require('cors');

const swaggerUI = require('swagger-ui-express')
const swaggerDocument = require('./swagger.json');
app.use('/api-docs', swaggerUI.serve, swaggerUI.setup(swaggerDocument));

app.use(cors())
app.use(express.json());
app.post('/register', registerRoute);
app.post('/login', authRoute);

app.listen(port, () => {
    console.log('Server is up on port ' + port)
})
