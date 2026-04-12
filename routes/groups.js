const express = require('express')
const router = express.Router()
const { requireAuth } = require('../middleware/auth')
const Group = require('../models/Group')

const COLORS = ['#06C755', '#FF6B6B', '#4ECDC4', '#9B59B6', '#F39C12']

// GET /api/groups
router.get('/', requireAuth, async (req, res) => {
  const groups = await Group.find({ members: req.userId }).populate('members admins createdBy')
  res.json(groups)
})

// POST /api/groups
router.post('/', requireAuth, async (req, res) => {
  const { name, description, memberIds = [] } = req.body
  if (!name) return res.status(400).json({ error: 'name required' })

  const allMembers = [...new Set([req.userId.toString(), ...memberIds])]
  const group = await Group.create({
    name,
    description: description || '',
    avatarColor: COLORS[Math.floor(Math.random() * COLORS.length)],
    members: allMembers,
    admins: [req.userId],
    createdBy: req.userId,
  })
  const populated = await group.populate('members admins createdBy')
  res.json(populated)
})

// GET /api/groups/:id
router.get('/:id', requireAuth, async (req, res) => {
  const group = await Group.findOne({ _id: req.params.id, members: req.userId })
    .populate('members admins createdBy')
  if (!group) return res.status(404).json({ error: 'Group not found' })
  res.json(group)
})

// POST /api/groups/:id/members
router.post('/:id/members', requireAuth, async (req, res) => {
  const { memberIds = [] } = req.body
  const group = await Group.findOneAndUpdate(
    { _id: req.params.id, members: req.userId },
    { $addToSet: { members: { $each: memberIds } } },
    { new: true }
  ).populate('members admins createdBy')
  if (!group) return res.status(404).json({ error: 'Group not found' })

  const io = req.app.get('io')
  io.to(`group:${group._id}`).emit('group_updated', { group })

  res.json(group)
})

// DELETE /api/groups/:id/leave
router.delete('/:id/leave', requireAuth, async (req, res) => {
  const group = await Group.findOneAndUpdate(
    { _id: req.params.id, members: req.userId },
    { $pull: { members: req.userId, admins: req.userId } },
    { new: true }
  )
  if (!group) return res.status(404).json({ error: 'Group not found' })

  // Delete group if no members left
  if (group.members.length === 0) {
    await Group.findByIdAndDelete(group._id)
  }

  const io = req.app.get('io')
  io.to(`group:${group._id}`).emit('member_left', { groupId: group._id, userId: req.userId })

  res.json({ ok: true })
})

module.exports = router
