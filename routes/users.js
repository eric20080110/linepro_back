const express = require('express')
const router = express.Router()
const { createClerkClient } = require('@clerk/clerk-sdk-node')
const User = require('../models/User')
const { requireAuth } = require('../middleware/auth')

const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })

const AVATAR_COLORS = ['#06C755', '#FF6B6B', '#4ECDC4', '#9B59B6', '#F39C12', '#E74C3C', '#3498DB', '#2ECC71']

// POST /api/users/sync — called after Clerk login, upserts user doc
router.post('/sync', async (req, res) => {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing token' })
  }
  const token = authHeader.split(' ')[1]
  try {
    const payload = await clerkClient.verifyToken(token)
    const clerkId = payload.sub

    // Get user info from Clerk
    const clerkUser = await clerkClient.users.getUser(clerkId)
    const name = `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim() || clerkUser.username || 'User'
    const email = clerkUser.emailAddresses[0]?.emailAddress || ''
    const randomColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]

    const user = await User.findOneAndUpdate(
      { clerkId },
      { $setOnInsert: { clerkId, name, email, avatarColor: randomColor } },
      { upsert: true, new: true }
    )
    res.json(user)
  } catch (err) {
    console.error('Sync error:', err.message)
    res.status(401).json({ error: 'Invalid token' })
  }
})

// GET /api/users/me
router.get('/me', requireAuth, async (req, res) => {
  res.json(req.user)
})

// PATCH /api/users/me
router.patch('/me', requireAuth, async (req, res) => {
  const { name, statusMessage, avatarColor, status } = req.body
  const updates = {}
  if (name !== undefined) updates.name = name
  if (statusMessage !== undefined) updates.statusMessage = statusMessage
  if (avatarColor !== undefined) updates.avatarColor = avatarColor
  if (status !== undefined) updates.status = status

  const user = await User.findByIdAndUpdate(req.userId, updates, { new: true })
  res.json(user)
})

// GET /api/users/search?q=
router.get('/search', requireAuth, async (req, res) => {
  const q = req.query.q || ''
  if (q.length < 1) return res.json([])
  const users = await User.find({
    _id: { $ne: req.userId },
    $or: [
      { name: { $regex: q, $options: 'i' } },
      { email: { $regex: q, $options: 'i' } },
    ],
  }).limit(20)
  res.json(users)
})

module.exports = router
