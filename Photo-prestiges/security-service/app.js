const express = require('express');
const authRoutes = require('./routes/auth');
const mongoose = require('mongoose');

const app = express();

// Middleware voor JSON-parsing
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use('/api/auth', authRoutes);

// MongoDB-verbinding
mongoose.connect('mongodb://localhost:27017/security-service')
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.log(err));

// Start de server
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
    console.log(`Server gestart op poort ${PORT}`);
});

module.exports = server;
