const express = require('express')
const router = express.Router()
const { requireAuth } = require('../middleware/auth')
const { db, rowToUser } = require('../config/db')
const { randomUUID } = require('crypto')

const COLORS = ['#06C755', '#FF6B6B', '#4ECDC4', '#9B59B6', '#F39C12']

// Helper: fetch a group with members populated
async function fetchGroup(groupId) {
  const gRow = await db.execute({ sql: 'SELECT * FROM groups WHERE id = ?', args: [groupId] })
  if (gRow.rows.length === 0) return null
  const g = gRow.rows[0]

  const membersRow = await db.execute({
    sql: `SELECT u.*, gm.is_admin FROM users u
          JOIN group_members gm ON gm.user_id = u.id
          WHERE gm.group_id = ?`,
    args: [groupId],
  })
  const members = membersRow.rows.map(rowToUser)
  const admins = membersRow.rows.filter(r => r.is_admin).map(r => r.id)

  return {
    _id: g.id,
    name: g.name,
    description: g.description,
    avatarColor: g.avatar_color,
    avatarUrl: g.avatar_url || '',
    createdBy: g.created_by,
    members,
    admins,
  }
}

// GET /api/groups
router.get('/', requireAuth, async (req, res) => {
  const groupIds = await db.execute({
    sql: 'SELECT group_id FROM group_members WHERE user_id = ?',
    args: [req.userId],
  })
  const groups = await Promise.all(groupIds.rows.map(r => fetchGroup(r.group_id)))
  res.json(groups.filter(Boolean))
})

// POST /api/groups
router.post('/', requireAuth, async (req, res) => {
  const { name, description, memberIds = [] } = req.body
  if (!name) return res.status(400).json({ error: 'name required' })

  const groupId = randomUUID()
  const color = COLORS[Math.floor(Math.random() * COLORS.length)]
  const allMemberIds = [...new Set([req.userId, ...memberIds])]

  await db.batch([
    {
      sql: 'INSERT INTO groups (id, name, description, avatar_color, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      args: [groupId, name, description || '', color, req.userId, Date.now()],
    },
    ...allMemberIds.map(uid => ({
      sql: 'INSERT INTO group_members (group_id, user_id, is_admin) VALUES (?, ?, ?)',
      args: [groupId, uid, uid === req.userId ? 1 : 0],
    })),
  ], 'write')

  const group = await fetchGroup(groupId)
  res.json(group)
})

// GET /api/groups/:id
router.get('/:id', requireAuth, async (req, res) => {
  // Verify membership
  const member = await db.execute({
    sql: 'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?',
    args: [req.params.id, req.userId],
  })
  if (member.rows.length === 0) return res.status(404).json({ error: 'Group not found' })
  const group = await fetchGroup(req.params.id)
  res.json(group)
})

// PATCH /api/groups/:id
router.patch('/:id', requireAuth, async (req, res) => {
  const groupId = req.params.id
  // Verify requester is a member (or admin depending on rules, let's say member can update)
  const isMember = await db.execute({
    sql: 'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?',
    args: [groupId, req.userId],
  })
  if (isMember.rows.length === 0) return res.status(404).json({ error: 'Group not found' })

  const { name, description, avatarUrl } = req.body
  const fields = []
  const args = []
  if (name !== undefined) { fields.push('name = ?'); args.push(name) }
  if (description !== undefined) { fields.push('description = ?'); args.push(description) }
  if (avatarUrl !== undefined) { fields.push('avatar_url = ?'); args.push(avatarUrl) }

  if (fields.length > 0) {
    args.push(groupId)
    await db.execute({ sql: `UPDATE groups SET ${fields.join(', ')} WHERE id = ?`, args })
  }

  const group = await fetchGroup(groupId)
  const io = req.app.get('io')
  io.to(`group:${groupId}`).emit('group_updated', { group })
  res.json(group)
})

// POST /api/groups/:id/members
router.post('/:id/members', requireAuth, async (req, res) => {
  const { memberIds = [] } = req.body
  const groupId = req.params.id

  // Verify requester is a member
  const isMember = await db.execute({
    sql: 'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?',
    args: [groupId, req.userId],
  })
  if (isMember.rows.length === 0) return res.status(404).json({ error: 'Group not found' })

  await db.batch(
    memberIds.map(uid => ({
      sql: 'INSERT OR IGNORE INTO group_members (group_id, user_id, is_admin) VALUES (?, ?, 0)',
      args: [groupId, uid],
    })),
    'write'
  )

  const group = await fetchGroup(groupId)
  const io = req.app.get('io')
  io.to(`group:${groupId}`).emit('group_updated', { group })
  res.json(group)
})

// DELETE /api/groups/:id/leave
router.delete('/:id/leave', requireAuth, async (req, res) => {
  const groupId = req.params.id

  await db.execute({
    sql: 'DELETE FROM group_members WHERE group_id = ? AND user_id = ?',
    args: [groupId, req.userId],
  })

  // Delete group if no members left
  const remaining = await db.execute({
    sql: 'SELECT COUNT(*) as cnt FROM group_members WHERE group_id = ?',
    args: [groupId],
  })
  if (Number(remaining.rows[0].cnt) === 0) {
    await db.execute({ sql: 'DELETE FROM groups WHERE id = ?', args: [groupId] })
  }

  const io = req.app.get('io')
  io.to(`group:${groupId}`).emit('member_left', { groupId, userId: req.userId })
  res.json({ ok: true })
})

module.exports = router
