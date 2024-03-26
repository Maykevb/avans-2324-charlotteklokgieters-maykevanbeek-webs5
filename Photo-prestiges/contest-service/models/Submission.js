const User = require('/register-service/models/User');
const Contest = require('/contest-service/models/Contest');
const mongoose = require("mongoose");

const submissionSchema = new mongoose.Schema({
    contest: {
        type: Contest,
        required: true
    },
    participant: {
        type: User,
        required: true,
    },
    image: {
        type: String
    },
});

module.exports = mongoose.model('Submission', submissionSchema);