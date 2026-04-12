const mongoose = require('mongoose')

const FriendshipSchema = new mongoose.Schema({
  users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
  createdAt: { type: Date, default: Date.now },
})

FriendshipSchema.index({ users: 1 }, { unique: true })

module.exports = mongoose.model('Friendship', FriendshipSchema)
