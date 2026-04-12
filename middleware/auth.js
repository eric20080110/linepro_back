const { createClerkClient } = require('@clerk/clerk-sdk-node')
const { db, rowToUser } = require('../config/db')

const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization header' })
  }
  const token = authHeader.split(' ')[1]
  try {
    const payload = await clerkClient.verifyToken(token)
    const clerkId = payload.sub
    const result = await db.execute({ sql: 'SELECT * FROM users WHERE clerk_id = ?', args: [clerkId] })
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User not synced. Call POST /api/users/sync first.' })
    }
    const user = rowToUser(result.rows[0])
    req.userId = user._id
    req.clerkId = clerkId
    req.user = user
    next()
  } catch (err) {
    console.error('Auth error:', err.message)
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}

module.exports = { requireAuth, clerkClient }
