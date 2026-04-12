require('dotenv').config()
const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const cors = require('cors')
const connectDB = require('./config/db')
const setupSocket = require('./socket/handlers')

const usersRouter    = require('./routes/users')
const friendsRouter  = require('./routes/friends')
const groupsRouter   = require('./routes/groups')
const messagesRouter = require('./routes/messages')

const app = express()
const server = http.createServer(app)

// Allow multiple origins (local dev + Render frontend)
const ALLOWED_ORIGINS = (process.env.FRONTEND_URL || '')
  .split(',')
  .map(s => s.trim().replace(/\/$/, ''))  // strip trailing slash
  .filter(Boolean)
  .concat(['http://localhost:5173', 'http://localhost:5174'])

const corsOptions = {
  origin: (origin, cb) => {
    // Allow requests with no origin (curl, mobile apps) and listed origins
    if (!origin || ALLOWED_ORIGINS.some(o => origin.startsWith(o))) {
      cb(null, true)
    } else {
      cb(new Error(`CORS blocked: ${origin}`))
    }
  },
  credentials: true,
}

const io = new Server(server, {
  cors: { origin: corsOptions.origin, methods: ['GET', 'POST'], credentials: true },
})

app.set('io', io)
app.use(cors(corsOptions))
app.use(express.json())

app.use('/api/users',    usersRouter)
app.use('/api/friends',  friendsRouter)
app.use('/api/groups',   groupsRouter)
app.use('/api/messages', messagesRouter)

app.get('/health', (_, res) => res.json({ status: 'ok' }))

app.use((err, req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: 'Internal server error' })
})

setupSocket(io)

const PORT = process.env.PORT || 3001
connectDB().then(() => {
  server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`))
})
