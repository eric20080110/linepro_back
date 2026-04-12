const express = require('express')
const router = express.Router()
const { requireAuth } = require('../middleware/auth')
const Message = require('../models/Message')
const Group = require('../models/Group')
const { getDMRoomId, getGroupRoomId } = require('../socket/roomHelpers')

// GET /api/messages/dm/:partnerId?limit=50&before=<timestamp>
router.get('/dm/:partnerId', requireAuth, async (req, res) => {
  const { partnerId } = req.params
  const limit = Math.min(parseInt(req.query.limit) || 50, 100)
  const before = req.query.before ? new Date(req.query.before) : new Date()

  const messages = await Message.find({
    type: 'dm',
    $or: [
      { senderId: req.userId, receiverId: partnerId },
      { senderId: partnerId, receiverId: req.userId },
    ],
    timestamp: { $lt: before },
  })
    .sort({ timestamp: -1 })
    .limit(limit)
    .populate('senderId', 'name avatarColor')

  res.json(messages.reverse())
})

// GET /api/messages/group/:groupId?limit=50&before=<timestamp>
router.get('/group/:groupId', requireAuth, async (req, res) => {
  const { groupId } = req.params
  const limit = Math.min(parseInt(req.query.limit) || 50, 100)
  const before = req.query.before ? new Date(req.query.before) : new Date()

  // Verify membership
  const group = await Group.findOne({ _id: groupId, members: req.userId })
  if (!group) return res.status(403).json({ error: 'Not a member' })

  const messages = await Message.find({
    type: 'group',
    groupId,
    timestamp: { $lt: before },
  })
    .sort({ timestamp: -1 })
    .limit(limit)
    .populate('senderId', 'name avatarColor')

  res.json(messages.reverse())
})

// POST /api/messages/dm — { receiverId, text }
router.post('/dm', requireAuth, async (req, res) => {
  const { receiverId, text } = req.body
  if (!receiverId || !text?.trim()) {
    return res.status(400).json({ error: 'receiverId and text required' })
  }

  const message = await Message.create({
    type: 'dm',
    senderId: req.userId,
    receiverId,
    text: text.trim(),
    timestamp: new Date(),
  })
  await message.populate('senderId', 'name avatarColor')

  const io = req.app.get('io')
  const roomId = getDMRoomId(req.userId.toString(), receiverId)
  io.to(roomId).emit('new_message', message)

  res.json(message)
})

// POST /api/messages/group — { groupId, text }
router.post('/group', requireAuth, async (req, res) => {
  const { groupId, text } = req.body
  if (!groupId || !text?.trim()) {
    return res.status(400).json({ error: 'groupId and text required' })
  }

  const group = await Group.findOne({ _id: groupId, members: req.userId })
  if (!group) return res.status(403).json({ error: 'Not a member' })

  const message = await Message.create({
    type: 'group',
    senderId: req.userId,
    groupId,
    text: text.trim(),
    timestamp: new Date(),
  })
  await message.populate('senderId', 'name avatarColor')

  const io = req.app.get('io')
  io.to(getGroupRoomId(groupId)).emit('new_message', message)

  res.json(message)
})

// DELETE /api/messages/dm/:partnerId — delete all DM messages between me and partner
router.delete('/dm/:partnerId', requireAuth, async (req, res) => {
  const { partnerId } = req.params
  await Message.deleteMany({
    type: 'dm',
    $or: [
      { senderId: req.userId, receiverId: partnerId },
      { senderId: partnerId, receiverId: req.userId },
    ],
  })
  res.json({ ok: true })
})

// DELETE /api/messages/group/:groupId — delete all messages in a group (admin only)
router.delete('/group/:groupId', requireAuth, async (req, res) => {
  const { groupId } = req.params
  const group = await Group.findOne({ _id: groupId, members: req.userId })
  if (!group) return res.status(403).json({ error: 'Not a member' })
  await Message.deleteMany({ type: 'group', groupId })
  res.json({ ok: true })
})

module.exports = router
