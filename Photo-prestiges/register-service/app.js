const express = require('express');
const mongoose = require('mongoose');
const usersRoutes = require('./routes/users');

const app = express();

// Middleware voor JSON-parsing
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use('/api/users', usersRoutes);

// MongoDB-verbinding
mongoose.connect('mongodb://localhost:27017/register-service')
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.log(err));

// Start de server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`Server gestart op poort ${PORT}`);
});
