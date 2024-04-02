require('dotenv').config();

const express = require('express');
const router = express.Router();
const CircuitBreaker = require('opossum');