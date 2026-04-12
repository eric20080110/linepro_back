const mongoose = require('mongoose')

const MessageSchema = new mongoose.Schema({
  type:       { type: String, enum: ['dm', 'group'], required: true },
  senderId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  groupId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Group' },
  text:       { type: String, required: true },
  timestamp:  { type: Date, default: Date.now, index: true },
}, { timestamps: true })

MessageSchema.index({ type: 1, senderId: 1, receiverId: 1, timestamp: -1 })
MessageSchema.index({ type: 1, groupId: 1, timestamp: -1 })

module.exports = mongoose.model('Message', MessageSchema)
