const mongoose = require('mongoose')

const UserSchema = new mongoose.Schema({
  clerkId:       { type: String, required: true, unique: true, index: true },
  name:          { type: String, required: true },
  email:         { type: String, required: true },
  avatarColor:   { type: String, default: '#06C755' },
  status:        { type: String, enum: ['online', 'away', 'offline'], default: 'offline' },
  statusMessage: { type: String, default: '' },
}, { timestamps: true })

module.exports = mongoose.model('User', UserSchema)
