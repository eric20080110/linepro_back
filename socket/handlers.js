const User = require('../models/User')
const { getDMRoomId, getGroupRoomId } = require('./roomHelpers')

function setupSocket(io) {
  io.on('connection', async (socket) => {
    const userId = socket.handshake.auth.userId
    if (!userId) return socket.disconnect()

    // Join personal notification room
    socket.join(`user:${userId}`)

    // Mark user as online
    await User.findByIdAndUpdate(userId, { status: 'online' })
    socket.broadcast.emit('status_changed', { userId, status: 'online' })

    console.log(`🔌 Socket connected: ${userId}`)

    // Join DM room
    socket.on('join_dm', ({ partnerId }) => {
      const roomId = getDMRoomId(userId, partnerId)
      socket.join(roomId)
    })

    // Join group room
    socket.on('join_group', ({ groupId }) => {
      socket.join(getGroupRoomId(groupId))
    })

    // Leave a room
    socket.on('leave_room', ({ roomId }) => {
      socket.leave(roomId)
    })

    // Typing indicator (optional)
    socket.on('user_typing', ({ roomId }) => {
      socket.to(roomId).emit('user_typing', { roomId, userId })
    })

    // On disconnect: mark offline
    socket.on('disconnect', async () => {
      await User.findByIdAndUpdate(userId, { status: 'offline' })
      socket.broadcast.emit('status_changed', { userId, status: 'offline' })
      console.log(`🔌 Socket disconnected: ${userId}`)
    })
  })
}

module.exports = setupSocket
