const mongoose = require("mongoose");
const ObjectId = mongoose.Types.ObjectId;

const submissionSchema = new mongoose.Schema({
    contest: {
        type: ObjectId,
        ref: 'Contest',
        required: true
    },
    participant: {
        type: ObjectId,
        ref: 'User',
        required: true,
    },
    image: {
        type: String
    },
});

module.exports = mongoose.model('Submission', submissionSchema);