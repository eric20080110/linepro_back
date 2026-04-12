const express = require('express')
const router = express.Router()
const { requireAuth } = require('../middleware/auth')
const { db, rowToUser } = require('../config/db')
const { randomUUID } = require('crypto')

// GET /api/friends
router.get('/', requireAuth, async (req, res) => {
  const result = await db.execute({
    sql: `SELECT u.* FROM users u
          JOIN friendships f ON (f.user1_id = u.id OR f.user2_id = u.id)
          WHERE (f.user1_id = ? OR f.user2_id = ?) AND u.id != ?`,
    args: [req.userId, req.userId, req.userId],
  })
  res.json(result.rows.map(rowToUser))
})

// GET /api/friends/requests
router.get('/requests', requireAuth, async (req, res) => {
  const result = await db.execute({
    sql: `SELECT u.* FROM users u
          JOIN friend_requests fr ON fr.from_id = u.id
          WHERE fr.to_id = ?`,
    args: [req.userId],
  })
  res.json(result.rows.map(rowToUser))
})

// POST /api/friends/request { targetId }
router.post('/request', requireAuth, async (req, res) => {
  const { targetId } = req.body
  if (!targetId) return res.status(400).json({ error: 'targetId required' })

  const [u1, u2] = [req.userId, targetId].sort()
  const alreadyFriends = await db.execute({
    sql: 'SELECT id FROM friendships WHERE user1_id = ? AND user2_id = ?',
    args: [u1, u2],
  })
  if (alreadyFriends.rows.length > 0) return res.status(400).json({ error: 'Already friends' })

  const existing = await db.execute({
    sql: 'SELECT id FROM friend_requests WHERE from_id = ? AND to_id = ?',
    args: [req.userId, targetId],
  })
  if (existing.rows.length > 0) return res.status(400).json({ error: 'Request already sent' })

  await db.execute({
    sql: 'INSERT INTO friend_requests (id, from_id, to_id, created_at) VALUES (?, ?, ?, ?)',
    args: [randomUUID(), req.userId, targetId, Date.now()],
  })

  const fromUser = await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [req.userId] })
  const io = req.app.get('io')
  io.to(`user:${targetId}`).emit('friend_request_received', { from: rowToUser(fromUser.rows[0]) })

  res.json({ ok: true })
})

// POST /api/friends/accept { requesterId }
router.post('/accept', requireAuth, async (req, res) => {
  const { requesterId } = req.body
  if (!requesterId) return res.status(400).json({ error: 'requesterId required' })

  const deleted = await db.execute({
    sql: 'DELETE FROM friend_requests WHERE from_id = ? AND to_id = ? RETURNING id',
    args: [requesterId, req.userId],
  })
  if (deleted.rows.length === 0) return res.status(404).json({ error: 'Request not found' })

  const [u1, u2] = [req.userId, requesterId].sort()
  await db.execute({
    sql: 'INSERT OR IGNORE INTO friendships (id, user1_id, user2_id, created_at) VALUES (?, ?, ?, ?)',
    args: [randomUUID(), u1, u2, Date.now()],
  })

  const [meRow, requesterRow] = await Promise.all([
    db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [req.userId] }),
    db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [requesterId] }),
  ])

  const io = req.app.get('io')
  io.to(`user:${requesterId}`).emit('friend_accepted', { friend: rowToUser(meRow.rows[0]) })
  io.to(`user:${req.userId}`).emit('friend_accepted', { friend: rowToUser(requesterRow.rows[0]) })

  res.json({ ok: true })
})

// POST /api/friends/reject { requesterId }
router.post('/reject', requireAuth, async (req, res) => {
  const { requesterId } = req.body
  await db.execute({
    sql: 'DELETE FROM friend_requests WHERE from_id = ? AND to_id = ?',
    args: [requesterId, req.userId],
  })
  res.json({ ok: true })
})

// DELETE /api/friends/:friendId
router.delete('/:friendId', requireAuth, async (req, res) => {
  const { friendId } = req.params
  const [u1, u2] = [req.userId, friendId].sort()
  await db.execute({
    sql: 'DELETE FROM friendships WHERE user1_id = ? AND user2_id = ?',
    args: [u1, u2],
  })
  res.json({ ok: true })
})

module.exports = router
