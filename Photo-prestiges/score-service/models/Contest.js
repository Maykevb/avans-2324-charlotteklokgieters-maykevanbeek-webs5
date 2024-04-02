const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;

const contestSchema = new mongoose.Schema({
    owner: {
        type: ObjectId,
        ref: 'User',
        required: true
    },
    description: {
        type: String
    },
    place: {
        type: String
    },
    image: {
        type: String
    },
    endTime: {
        type: Date,
        required: true
    },
    statusOpen: {
        type: Boolean,
        default: true
    },
    thumbsUp: {
        type: Number,
        default: 0
    },
    thumbsDown: {
        type: Number,
        default: 0
    }
});

module.exports = mongoose.model('Contest', contestSchema);
