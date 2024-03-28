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
    }
});

module.exports = mongoose.model('Contest', contestSchema);
