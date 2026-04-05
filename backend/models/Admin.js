const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const adminSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    passwordHash: { type: String, required: true },
    role: { type: String, default: 'admin', enum: ['admin'] },
    lastLogin: { type: Date },
    createdAt: { type: Date, default: Date.now }
});

// Compare password
adminSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.passwordHash);
};

module.exports = mongoose.model('Admin', adminSchema);
