const { db } = require('../config/db')
const { getDMRoomId, getGroupRoomId } = require('./roomHelpers')

function setupSocket(io) {
  io.on('connection', async (socket) => {
    const userId = socket.handshake.auth.userId
    if (!userId) return socket.disconnect()

    socket.join(`user:${userId}`)

    // Mark online
    await db.execute({ sql: "UPDATE users SET status = 'online' WHERE id = ?", args: [userId] }).catch(() => {})
    socket.broadcast.emit('status_changed', { userId, status: 'online' })

    console.log(`🔌 Connected: ${userId}`)

    socket.on('join_dm', ({ partnerId }) => {
      socket.join(getDMRoomId(userId, partnerId))
    })

    socket.on('join_group', ({ groupId }) => {
      socket.join(getGroupRoomId(groupId))
    })

    socket.on('leave_room', ({ roomId }) => {
      socket.leave(roomId)
    })

    socket.on('user_typing', ({ roomId }) => {
      socket.to(roomId).emit('user_typing', { roomId, userId })
    })

    socket.on('mark_read', ({ roomId, readerId }) => {
      socket.to(roomId).emit('messages_read', { readerId, roomId })
    })

    socket.on('disconnect', async () => {
      await db.execute({ sql: "UPDATE users SET status = 'offline' WHERE id = ?", args: [userId] }).catch(() => {})
      socket.broadcast.emit('status_changed', { userId, status: 'offline' })
      console.log(`🔌 Disconnected: ${userId}`)
    })
  })
}

module.exports = setupSocket
