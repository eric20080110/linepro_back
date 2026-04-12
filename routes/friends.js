const express = require('express')
const router = express.Router()
const { requireAuth } = require('../middleware/auth')
const Friendship = require('../models/Friendship')
const FriendRequest = require('../models/FriendRequest')
const User = require('../models/User')

// GET /api/friends — get my friends list
router.get('/', requireAuth, async (req, res) => {
  const friendships = await Friendship.find({ users: req.userId }).populate('users')
  const friends = friendships.map(f =>
    f.users.find(u => u._id.toString() !== req.userId.toString())
  ).filter(Boolean)
  res.json(friends)
})

// GET /api/friends/requests — incoming friend requests
router.get('/requests', requireAuth, async (req, res) => {
  const requests = await FriendRequest.find({ to: req.userId }).populate('from')
  res.json(requests.map(r => r.from))
})

// POST /api/friends/request — send friend request { targetId }
router.post('/request', requireAuth, async (req, res) => {
  const { targetId } = req.body
  if (!targetId) return res.status(400).json({ error: 'targetId required' })

  // Check not already friends
  const alreadyFriends = await Friendship.findOne({
    users: { $all: [req.userId, targetId] }
  })
  if (alreadyFriends) return res.status(400).json({ error: 'Already friends' })

  // Check not already requested
  const existing = await FriendRequest.findOne({ from: req.userId, to: targetId })
  if (existing) return res.status(400).json({ error: 'Request already sent' })

  const request = await FriendRequest.create({ from: req.userId, to: targetId })

  // Emit socket event to target
  const io = req.app.get('io')
  const fromUser = await User.findById(req.userId)
  io.to(`user:${targetId}`).emit('friend_request_received', { from: fromUser })

  res.json({ ok: true })
})

// POST /api/friends/accept — { requesterId }
router.post('/accept', requireAuth, async (req, res) => {
  const { requesterId } = req.body
  if (!requesterId) return res.status(400).json({ error: 'requesterId required' })

  const request = await FriendRequest.findOneAndDelete({ from: requesterId, to: req.userId })
  if (!request) return res.status(404).json({ error: 'Request not found' })

  // Create friendship (sorted IDs for deduplication)
  const sortedIds = [req.userId.toString(), requesterId].sort()
  await Friendship.findOneAndUpdate(
    { users: sortedIds },
    { users: sortedIds },
    { upsert: true }
  )

  const [meUser, requesterUser] = await Promise.all([
    User.findById(req.userId),
    User.findById(requesterId),
  ])

  const io = req.app.get('io')
  io.to(`user:${requesterId}`).emit('friend_accepted', { friend: meUser })
  io.to(`user:${req.userId}`).emit('friend_accepted', { friend: requesterUser })

  res.json({ ok: true })
})

// POST /api/friends/reject — { requesterId }
router.post('/reject', requireAuth, async (req, res) => {
  const { requesterId } = req.body
  await FriendRequest.findOneAndDelete({ from: requesterId, to: req.userId })
  res.json({ ok: true })
})

// DELETE /api/friends/:friendId
router.delete('/:friendId', requireAuth, async (req, res) => {
  const { friendId } = req.params
  await Friendship.findOneAndDelete({
    users: { $all: [req.userId, friendId] }
  })
  res.json({ ok: true })
})

module.exports = router
