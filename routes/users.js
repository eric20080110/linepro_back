const express = require('express')
const router = express.Router()
const { createClerkClient } = require('@clerk/clerk-sdk-node')
const { db, rowToUser } = require('../config/db')
const { requireAuth } = require('../middleware/auth')
const { randomUUID } = require('crypto')

const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })

const AVATAR_COLORS = ['#06C755', '#FF6B6B', '#4ECDC4', '#9B59B6', '#F39C12', '#E74C3C', '#3498DB', '#2ECC71']

// POST /api/users/sync
router.post('/sync', async (req, res) => {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing token' })
  }
  const token = authHeader.split(' ')[1]
  try {
    const payload = await clerkClient.verifyToken(token)
    const clerkId = payload.sub

    const clerkUser = await clerkClient.users.getUser(clerkId)
    const name = `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim() || clerkUser.username || 'User'
    const email = clerkUser.emailAddresses[0]?.emailAddress || ''

    // Check if user exists
    const existing = await db.execute({ sql: 'SELECT * FROM users WHERE clerk_id = ?', args: [clerkId] })
    if (existing.rows.length > 0) {
      return res.json(rowToUser(existing.rows[0]))
    }

    // Insert new user
    const id = randomUUID()
    const color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]
    await db.execute({
      sql: 'INSERT INTO users (id, clerk_id, name, email, avatar_color) VALUES (?, ?, ?, ?, ?)',
      args: [id, clerkId, name, email, color],
    })
    const created = await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [id] })
    res.json(rowToUser(created.rows[0]))
  } catch (err) {
    console.error('Sync error:', err.message)
    res.status(401).json({ error: 'Invalid token' })
  }
})

// GET /api/users/me
router.get('/me', requireAuth, (req, res) => {
  res.json(req.user)
})

// PATCH /api/users/me
router.patch('/me', requireAuth, async (req, res) => {
  const { name, nickname, statusMessage, avatarColor, status } = req.body
  const fields = []
  const args = []
  if (name !== undefined)          { fields.push('name = ?');           args.push(name) }
  if (nickname !== undefined)      { fields.push('nickname = ?');       args.push(nickname) }
  if (statusMessage !== undefined) { fields.push('status_message = ?'); args.push(statusMessage) }
  if (avatarColor !== undefined)   { fields.push('avatar_color = ?');   args.push(avatarColor) }
  if (status !== undefined)        { fields.push('status = ?');         args.push(status) }
  if (fields.length === 0) return res.json(req.user)

  args.push(req.userId)
  await db.execute({ sql: `UPDATE users SET ${fields.join(', ')} WHERE id = ?`, args })
  const updated = await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [req.userId] })
  res.json(rowToUser(updated.rows[0]))
})

// GET /api/users/search?q=
router.get('/search', requireAuth, async (req, res) => {
  const q = `%${req.query.q || ''}%`
  if (!req.query.q || req.query.q.length < 1) return res.json([])
  const result = await db.execute({
    sql: `SELECT * FROM users WHERE id != ? AND (name LIKE ? OR nickname LIKE ? OR email LIKE ?) LIMIT 20`,
    args: [req.userId, q, q, q],
  })
  res.json(result.rows.map(rowToUser))
})

module.exports = router
