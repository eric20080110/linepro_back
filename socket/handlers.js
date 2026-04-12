const User = require('../models/User')
const { getDMRoomId, getGroupRoomId } = require('./roomHelpers')

function setupSocket(io) {
  io.on('connection', async (socket) => {
    const userId = socket.handshake.auth.userId
    if (!userId) return socket.disconnect()

    // Personal notification room
    socket.join(`user:${userId}`)

    // Mark online
    await User.findByIdAndUpdate(userId, { status: 'online' }).catch(() => {})
    socket.broadcast.emit('status_changed', { userId, status: 'online' })

    console.log(`🔌 Connected: ${userId}`)

    // Join DM room
    socket.on('join_dm', ({ partnerId }) => {
      const roomId = getDMRoomId(userId, partnerId)
      socket.join(roomId)
    })

    // Join group room
    socket.on('join_group', ({ groupId }) => {
      socket.join(getGroupRoomId(groupId))
    })

    // Leave a specific room (on chat switch)
    socket.on('leave_room', ({ roomId }) => {
      socket.leave(roomId)
    })

    // Typing indicator
    socket.on('user_typing', ({ roomId }) => {
      socket.to(roomId).emit('user_typing', { roomId, userId })
    })

    // Client notifies read (lightweight path — bulk update done via REST)
    socket.on('mark_read', ({ roomId, readerId }) => {
      socket.to(roomId).emit('messages_read', { readerId, roomId })
    })

    socket.on('disconnect', async () => {
      await User.findByIdAndUpdate(userId, { status: 'offline' }).catch(() => {})
      socket.broadcast.emit('status_changed', { userId, status: 'offline' })
      console.log(`🔌 Disconnected: ${userId}`)
    })
  })
}

module.exports = setupSocket
