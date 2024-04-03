require('dotenv').config({ path: '../.env' })

const express = require('express');
const router = express.Router();
const CircuitBreaker = require('opossum');