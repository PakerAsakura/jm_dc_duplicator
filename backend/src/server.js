const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const dotenv = require('dotenv')
const { Server } = require('socket.io')
const http = require('http')
const { DiscordDuplicator } = require('./duplicator')

dotenv.config()

const app = express()
const server = http.createServer(app)
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  },
})

// Middleware
app.use(
  helmet({
    contentSecurityPolicy: false,
  }),
)
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  }),
)
app.use(express.json())

// Store active processes
const activeProcesses = new Map()

// ==================== ADD THESE ENDPOINTS ====================

// 1. Root endpoint - test if server is online
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    message: 'Discord Duplicator API',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  })
})

// 2. Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    serverTime: new Date().toISOString(),
    uptime: process.uptime(),
    activeProcesses: activeProcesses.size,
    memoryUsage: process.memoryUsage(),
  })
})

// 3. Simple ping endpoint
app.get('/api/ping', (req, res) => {
  res.json({
    success: true,
    message: 'pong',
    timestamp: Date.now(),
  })
})

// ==================== END OF ADDED ENDPOINTS ====================

// Socket.IO connection
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`)

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`)
  })
})

// API Routes
app.post('/api/duplicate', async (req, res) => {
  try {
    const { botToken, sourceGuildId, targetGuildId } = req.body
    const processId = Date.now().toString()

    if (!botToken || !sourceGuildId || !targetGuildId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
      })
    }

    // Start duplication in background
    const duplicator = new DiscordDuplicator(
      botToken,
      sourceGuildId,
      targetGuildId,
      (data) => {
        // Emit progress via Socket.IO
        io.emit(`process:${processId}`, data)
      },
    )

    activeProcesses.set(processId, duplicator)

    duplicator
      .startDuplication()
      .then((result) => {
        console.log(`Process ${processId} completed`)
        activeProcesses.delete(processId)
      })
      .catch((error) => {
        console.error(`Process ${processId} failed:`, error)
        activeProcesses.delete(processId)
      })

    res.json({
      success: true,
      message: 'Duplication process started',
      processId,
    })
  } catch (error) {
    console.error('Server error:', error)
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

app.post('/api/cancel/:processId', (req, res) => {
  try {
    const { processId } = req.params
    const duplicator = activeProcesses.get(processId)

    if (duplicator) {
      duplicator.cancel()
      activeProcesses.delete(processId)
      res.json({ success: true, message: 'Process cancelled' })
    } else {
      res.status(404).json({ success: false, error: 'Process not found' })
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

const PORT = process.env.PORT || 3001
server.listen(PORT, () => {
  console.log(`🚀 Backend server running on port ${PORT}`)
  console.log(`🔗 WebSocket server ready for connections`)
  console.log(
    `🌐 CORS enabled for: ${process.env.CLIENT_URL || 'http://localhost:5173'}`,
  )
  console.log(
    `✅ Health check available at: http://localhost:${PORT}/api/health`,
  )
})
