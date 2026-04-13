const express = require('express')
const router = express.Router()
const { requireAuth } = require('../middleware/auth')
const { db } = require('../config/db')
const { getDMRoomId, getGroupRoomId } = require('../socket/roomHelpers')
const { randomUUID } = require('crypto')

// Helper: shape a message row into the object the frontend expects
function rowToMessage(row) {
  return {
    _id: row.id,
    type: row.type,
    senderId: {
      _id: row.sender_id,
      name: row.sender_name,
      nickname: row.sender_nickname || '',
      avatarColor: row.sender_color,
      avatarUrl: row.sender_avatar_url || '',
    },
    receiverId: row.receiver_id || null,
    groupId: row.group_id || null,
    text: row.text,
    mediaUrl: row.media_url || null,
    timestamp: Number(row.timestamp),
    readBy: row.read_by ? String(row.read_by).split(',') : [],
  }
}

const MSG_SELECT = `
  SELECT m.id, m.type, m.sender_id, m.receiver_id, m.group_id, m.text, m.media_url, m.timestamp,
    u.name AS sender_name, u.nickname AS sender_nickname, u.avatar_color AS sender_color, u.avatar_url AS sender_avatar_url,
    GROUP_CONCAT(mr.user_id) AS read_by
  FROM messages m
  JOIN users u ON u.id = m.sender_id
  LEFT JOIN message_reads mr ON mr.message_id = m.id
`

// GET /api/messages/dm/:partnerId
router.get('/dm/:partnerId', requireAuth, async (req, res) => {
  const { partnerId } = req.params
  const limit = Math.min(parseInt(req.query.limit) || 50, 100)
  const before = req.query.before ? Number(req.query.before) : Date.now()

  const result = await db.execute({
    sql: `${MSG_SELECT}
      WHERE m.type = 'dm'
        AND ((m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?))
        AND m.timestamp < ?
      GROUP BY m.id
      ORDER BY m.timestamp DESC
      LIMIT ?`,
    args: [req.userId, partnerId, partnerId, req.userId, before, limit],
  })
  res.json(result.rows.map(rowToMessage).reverse())
})

// GET /api/messages/group/:groupId
router.get('/group/:groupId', requireAuth, async (req, res) => {
  const { groupId } = req.params
  const limit = Math.min(parseInt(req.query.limit) || 50, 100)
  const before = req.query.before ? Number(req.query.before) : Date.now()

  const isMember = await db.execute({
    sql: 'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?',
    args: [groupId, req.userId],
  })
  if (isMember.rows.length === 0) return res.status(403).json({ error: 'Not a member' })

  const result = await db.execute({
    sql: `${MSG_SELECT}
      WHERE m.type = 'group' AND m.group_id = ? AND m.timestamp < ?
      GROUP BY m.id
      ORDER BY m.timestamp DESC
      LIMIT ?`,
    args: [groupId, before, limit],
  })
  res.json(result.rows.map(rowToMessage).reverse())
})

// POST /api/messages/dm
router.post('/dm', requireAuth, async (req, res) => {
  const { receiverId, text, mediaUrl } = req.body
  const cleanText = text?.trim() || ''
  const cleanMedia = mediaUrl?.trim() || ''
  if (!receiverId || (!cleanText && !cleanMedia)) return res.status(400).json({ error: 'receiverId and text or mediaUrl required' })

  const id = randomUUID()
  const ts = Date.now()
  await db.batch([
    {
      sql: 'INSERT INTO messages (id, type, sender_id, receiver_id, text, media_url, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [id, 'dm', req.userId, receiverId, cleanText, cleanMedia, ts],
    },
    { sql: 'INSERT OR IGNORE INTO message_reads (message_id, user_id) VALUES (?, ?)', args: [id, req.userId] },
  ], 'write')

  const result = await db.execute({
    sql: `${MSG_SELECT} WHERE m.id = ? GROUP BY m.id`,
    args: [id],
  })
  const message = rowToMessage(result.rows[0])

  const io = req.app.get('io')
  io.to(getDMRoomId(req.userId, receiverId)).emit('new_message', message)
  res.json(message)
})

// POST /api/messages/group
router.post('/group', requireAuth, async (req, res) => {
  const { groupId, text, mediaUrl } = req.body
  const cleanText = text?.trim() || ''
  const cleanMedia = mediaUrl?.trim() || ''
  if (!groupId || (!cleanText && !cleanMedia)) return res.status(400).json({ error: 'groupId and text or mediaUrl required' })

  const isMember = await db.execute({
    sql: 'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?',
    args: [groupId, req.userId],
  })
  if (isMember.rows.length === 0) return res.status(403).json({ error: 'Not a member' })

  const id = randomUUID()
  const ts = Date.now()
  await db.batch([
    {
      sql: 'INSERT INTO messages (id, type, sender_id, group_id, text, media_url, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [id, 'group', req.userId, groupId, cleanText, cleanMedia, ts],
    },
    { sql: 'INSERT OR IGNORE INTO message_reads (message_id, user_id) VALUES (?, ?)', args: [id, req.userId] },
  ], 'write')

  const result = await db.execute({
    sql: `${MSG_SELECT} WHERE m.id = ? GROUP BY m.id`,
    args: [id],
  })
  const message = rowToMessage(result.rows[0])

  const io = req.app.get('io')
  io.to(getGroupRoomId(groupId)).emit('new_message', message)
  res.json(message)
})

// POST /api/messages/dm/:partnerId/read
router.post('/dm/:partnerId/read', requireAuth, async (req, res) => {
  const { partnerId } = req.params

  // Get all unread messages from partner to me
  const unread = await db.execute({
    sql: `SELECT m.id FROM messages m
          LEFT JOIN message_reads mr ON mr.message_id = m.id AND mr.user_id = ?
          WHERE m.type = 'dm' AND m.sender_id = ? AND m.receiver_id = ? AND mr.message_id IS NULL`,
    args: [req.userId, partnerId, req.userId],
  })

  if (unread.rows.length > 0) {
    await db.batch(
      unread.rows.map(r => ({
        sql: 'INSERT OR IGNORE INTO message_reads (message_id, user_id) VALUES (?, ?)',
        args: [r.id, req.userId],
      })),
      'write'
    )
  }

  const io = req.app.get('io')
  io.to(getDMRoomId(req.userId, partnerId)).emit('messages_read', {
    readerId: req.userId,
    partnerId: req.userId,
    type: 'dm',
  })
  res.json({ ok: true })
})

// POST /api/messages/group/:groupId/read
router.post('/group/:groupId/read', requireAuth, async (req, res) => {
  const { groupId } = req.params

  const isMember = await db.execute({
    sql: 'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?',
    args: [groupId, req.userId],
  })
  if (isMember.rows.length === 0) return res.status(403).json({ error: 'Not a member' })

  const unread = await db.execute({
    sql: `SELECT m.id FROM messages m
          LEFT JOIN message_reads mr ON mr.message_id = m.id AND mr.user_id = ?
          WHERE m.type = 'group' AND m.group_id = ? AND m.sender_id != ? AND mr.message_id IS NULL`,
    args: [req.userId, groupId, req.userId],
  })

  if (unread.rows.length > 0) {
    await db.batch(
      unread.rows.map(r => ({
        sql: 'INSERT OR IGNORE INTO message_reads (message_id, user_id) VALUES (?, ?)',
        args: [r.id, req.userId],
      })),
      'write'
    )
  }

  const io = req.app.get('io')
  io.to(getGroupRoomId(groupId)).emit('messages_read', {
    readerId: req.userId,
    groupId,
    type: 'group',
  })
  res.json({ ok: true })
})

// DELETE /api/messages/dm/:partnerId
router.delete('/dm/:partnerId', requireAuth, async (req, res) => {
  const { partnerId } = req.params
  const msgs = await db.execute({
    sql: `SELECT id FROM messages WHERE type = 'dm'
          AND ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))`,
    args: [req.userId, partnerId, partnerId, req.userId],
  })
  if (msgs.rows.length > 0) {
    const ids = msgs.rows.map(r => r.id)
    await db.batch([
      ...ids.map(id => ({ sql: 'DELETE FROM message_reads WHERE message_id = ?', args: [id] })),
      ...ids.map(id => ({ sql: 'DELETE FROM messages WHERE id = ?', args: [id] })),
    ], 'write')
  }
  res.json({ ok: true })
})

// DELETE /api/messages/group/:groupId
router.delete('/group/:groupId', requireAuth, async (req, res) => {
  const { groupId } = req.params
  const isMember = await db.execute({
    sql: 'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?',
    args: [groupId, req.userId],
  })
  if (isMember.rows.length === 0) return res.status(403).json({ error: 'Not a member' })

  const msgs = await db.execute({
    sql: `SELECT id FROM messages WHERE type = 'group' AND group_id = ?`,
    args: [groupId],
  })
  if (msgs.rows.length > 0) {
    const ids = msgs.rows.map(r => r.id)
    await db.batch([
      ...ids.map(id => ({ sql: 'DELETE FROM message_reads WHERE message_id = ?', args: [id] })),
      ...ids.map(id => ({ sql: 'DELETE FROM messages WHERE id = ?', args: [id] })),
    ], 'write')
  }
  res.json({ ok: true })
})

module.exports = router
