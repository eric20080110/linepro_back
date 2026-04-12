require('dotenv').config()
const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const cors = require('cors')
const connectDB = require('./config/db')
const setupSocket = require('./socket/handlers')

const usersRouter   = require('./routes/users')
const friendsRouter = require('./routes/friends')
const groupsRouter  = require('./routes/groups')
const messagesRouter = require('./routes/messages')

const app = express()
const server = http.createServer(app)

const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5174',
    methods: ['GET', 'POST'],
  },
})

// Make io accessible in routes via req.app.get('io')
app.set('io', io)

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5174' }))
app.use(express.json())

app.use('/api/users',    usersRouter)
app.use('/api/friends',  friendsRouter)
app.use('/api/groups',   groupsRouter)
app.use('/api/messages', messagesRouter)

app.get('/health', (req, res) => res.json({ status: 'ok' }))

// Global error handler
app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ error: 'Internal server error' })
})

setupSocket(io)

const PORT = process.env.PORT || 3001

connectDB().then(() => {
  server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`)
  })
})
