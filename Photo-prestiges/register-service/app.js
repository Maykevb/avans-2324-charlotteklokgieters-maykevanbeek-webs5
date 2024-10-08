require('dotenv').config({ path: '../.env' })

const express = require('express');
const mongoose = require('mongoose');
const usersRoutes = require('./routes/users');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use('/users', usersRoutes);

// MongoDB-connection
mongoose.connect('mongodb://localhost:27017/register-service')
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.log(err));

// Starting the server
const PORT = process.env.REGISTERPORT || 4000;
app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
});
