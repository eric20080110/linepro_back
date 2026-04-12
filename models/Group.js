const mongoose = require('mongoose')

const GroupSchema = new mongoose.Schema({
  name:        { type: String, required: true, maxlength: 30 },
  description: { type: String, maxlength: 60, default: '' },
  avatarColor: { type: String, default: '#06C755' },
  members:     [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  admins:      [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true })

module.exports = mongoose.model('Group', GroupSchema)
