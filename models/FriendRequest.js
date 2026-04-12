const mongoose = require('mongoose')

const FriendRequestSchema = new mongoose.Schema({
  from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  to:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
})

FriendRequestSchema.index({ from: 1, to: 1 }, { unique: true })

module.exports = mongoose.model('FriendRequest', FriendRequestSchema)
