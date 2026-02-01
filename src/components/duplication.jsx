import React, { useState, useEffect, useRef } from 'react'
import img from '../assets/download.jpg'
import { io } from 'socket.io-client'

const Duplication = () => {
  const [clicked, setClicked] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [processId, setProcessId] = useState(null)
  const [progress, setProgress] = useState({ step: '', percentage: 0 })
  const [detailedProgress, setDetailedProgress] = useState({
    current: 0,
    total: 0,
    itemName: '',
    percentage: 0,
  })
  const [logs, setLogs] = useState([])
  const [connectionStatus, setConnectionStatus] = useState('disconnected')
  const socketRef = useRef(null)
  const logsEndRef = useRef(null)

  useEffect(() => {
    const backendUrl = 'http://localhost:3001'
    socketRef.current = io(backendUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    })

    socketRef.current.on('connect', () => {
      console.log('Connected to backend')
      setConnectionStatus('connected')
      addLog('Connected to backend server', 'info')
    })

    socketRef.current.on('disconnect', () => {
      console.log('Disconnected from backend')
      setConnectionStatus('disconnected')
      addLog('Disconnected from backend server', 'warning')
    })

    socketRef.current.on('connect_error', (error) => {
      console.error('Connection error:', error)
      setConnectionStatus('error')
      addLog(`Connection error: ${error.message}`, 'error')
    })

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect()
      }
    }
  }, [])

  useEffect(() => {
    if (!socketRef.current || !processId) return

    const eventName = `process:${processId}`

    const handleProgress = (data) => {
      console.log('Progress update:', data)

      if (data.type === 'progress') {
        setProgress({
          step: data.step,
          percentage: data.percentage,
        })
      } else if (data.type === 'detailed_progress') {
        setDetailedProgress({
          current: data.current,
          total: data.total,
          itemName: data.itemName,
          percentage: data.percentage,
        })
      } else if (data.type === 'log') {
        addLog(data.message, data.type)
      }
    }

    socketRef.current.on(eventName, handleProgress)

    return () => {
      socketRef.current.off(eventName, handleProgress)
    }
  }, [processId])

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString()
    setLogs((prev) => [
      ...prev,
      {
        timestamp,
        message,
        type,
      },
    ])
  }

  const handleProceed = async () => {
    let tokenId = document.getElementById('1').value.trim()
    const targetServerId = document.getElementById('2').value.trim()
    const sourceServerId = document.getElementById('3').value.trim()

    // Validation
    if (!tokenId || !targetServerId || !sourceServerId) {
      alert('Please fill in all fields!')
      return
    }

    // Remove "Bot " prefix if user entered it
    if (tokenId.toLowerCase().startsWith('bot ')) {
      tokenId = tokenId.substring(4)
    }

    setClicked(true)
    setIsProcessing(true)
    setLogs([])
    setProgress({ step: 'Starting...', percentage: 0 })
    setDetailedProgress({
      current: 0,
      total: 0,
      itemName: '',
      percentage: 0,
    })

    try {
      addLog('Sending duplication request to server...', 'info')

      const response = await fetch('http://localhost:3001/api/duplicate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          botToken: tokenId,
          sourceGuildId: sourceServerId,
          targetGuildId: targetServerId,
        }),
      })

      if (!response.ok) {
        throw new Error(`Server responded with status: ${response.status}`)
      }

      const data = await response.json()

      if (data.success) {
        setProcessId(data.processId)
        addLog(`Process started with ID: ${data.processId}`, 'info')
        addLog('Duplication process is now running...', 'info')
      } else {
        throw new Error(data.error || 'Failed to start duplication')
      }
    } catch (error) {
      console.error('Error:', error)
      addLog(`Error: ${error.message}`, 'error')
      addLog('Make sure the backend server is running on port 3001', 'warning')
      setIsProcessing(false)
      setClicked(false)
    }
  }

  const handleCancel = async () => {
    if (!processId) return

    try {
      const response = await fetch(
        `http://localhost:3001/api/cancel/${processId}`,
        {
          method: 'POST',
        },
      )

      const data = await response.json()

      if (data.success) {
        addLog('Process cancelled by user', 'warning')
      }

      setIsProcessing(false)
      setClicked(false)
      setProcessId(null)
    } catch (error) {
      console.error('Error cancelling:', error)
      addLog(`Error cancelling process: ${error.message}`, 'error')
    }
  }

  const getProgressColor = () => {
    if (progress.percentage < 30) return 'bg-red-500'
    if (progress.percentage < 70) return 'bg-yellow-500'
    return 'bg-green-500'
  }

  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case 'connected':
        return 'bg-green-500'
      case 'disconnected':
        return 'bg-red-500'
      case 'error':
        return 'bg-yellow-500'
      default:
        return 'bg-gray-500'
    }
  }

  const getConnectionStatusText = () => {
    switch (connectionStatus) {
      case 'connected':
        return 'Backend Connected'
      case 'disconnected':
        return 'Backend Disconnected'
      case 'error':
        return 'Connection Error'
      default:
        return 'Connecting...'
    }
  }

  const formatLogType = (type) => {
    switch (type) {
      case 'error':
        return '[ERROR]'
      case 'warning':
        return '[WARNING]'
      case 'info':
        return '[INFO]'
      default:
        return '[LOG]'
    }
  }

  const getLogTypeColor = (type) => {
    switch (type) {
      case 'error':
        return 'text-red-300'
      case 'warning':
        return 'text-yellow-300'
      case 'info':
        return 'text-blue-300'
      default:
        return 'text-green-300'
    }
  }

  return (
    <div>
      <div className="bg-gray-900 h-[850px] w-full">
        <img
          src={img}
          alt="Background"
          className="w-full h-[850px] object-cover opacity-40 blur-md"
        />

        <div className="absolute bottom-[30px] left-[150px] bg-pink-800 h-[600px] w-[450px] border-4 border-pink-900 rounded-3xl">
          <div className="flex flex-col items-center space-y-6 text-white bungee-regular text-3xl mt-8 mb-20">
            <h1>Server Information</h1>
          </div>

          <div className="m-8">
            <h1 className="text-white bungee-regular mb-2">TOKEN ID</h1>
            <input
              type="password"
              id="1"
              className="text-black bg-white border border-pink-100 focus:ring-0 rounded-md p-2 w-full mb-6 bungee-regular"
              placeholder="Enter bot token"
              disabled={isProcessing}
            />

            <h1 className="text-white bungee-regular mb-2">TARGET SERVER ID</h1>
            <input
              type="text"
              id="2"
              className="text-black bg-white border border-pink-100 focus:ring-0 rounded-md p-2 w-full mb-6 bungee-regular"
              placeholder="Enter target server ID"
              disabled={isProcessing}
            />

            <h1 className="text-white bungee-regular mb-2">SOURCE SERVER ID</h1>
            <input
              type="text"
              id="3"
              className="text-black bg-white border border-pink-100 focus:ring-0 rounded-md p-2 w-full mb-6 bungee-regular"
              placeholder="Enter source server ID"
              disabled={isProcessing}
            />

            <div className="flex items-center justify-center gap-4">
              <button
                onClick={handleProceed}
                disabled={isProcessing || connectionStatus !== 'connected'}
                className={`px-6 py-2 rounded-md bungee-regular font-bold transition-colors duration-100
                  ${
                    isProcessing || connectionStatus !== 'connected'
                      ? 'bg-gray-500 cursor-not-allowed'
                      : 'bg-white hover:bg-pink-100 text-black border border-pink-100 hover:scale-105 transition-transform'
                  }
                `}
              >
                {isProcessing ? 'Processing...' : 'Start Duplication'}
              </button>

              {isProcessing && (
                <button
                  onClick={handleCancel}
                  className="px-6 py-2 rounded-md bungee-regular font-bold bg-red-500 hover:bg-red-600 text-white transition-colors duration-100 hover:scale-105 transition-transform"
                >
                  Cancel
                </button>
              )}
            </div>

            {isProcessing && (
              <div className="mt-6 space-y-3">
                <div className="text-white bungee-regular">{progress.step}</div>
                <div className="w-full bg-gray-700 rounded-full h-4">
                  <div
                    className={`h-4 rounded-full ${getProgressColor()} transition-all duration-500`}
                    style={{ width: `${progress.percentage}%` }}
                  ></div>
                </div>
                <div className="text-white text-sm">
                  {progress.percentage}% Complete
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="text-white absolute text-3xl text-center items-center justify-center top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bungee-regular">
          Discord Duplicator
          <p className="text-base mt-4 px-8">
            A simple tool to duplicate your Discord server with ease. <br />
            Just enter your server details and <br />
            let the duplicator handle the rest!
          </p>
          <h1 className="text-pink-500 mt-10 p-5 rounded-full border-4 bg-pink-500/20 rgb-border">
            <span className="bouncing-letters">
              {Array.from('JM.BAT/PAKER.BAT').map((letter, index) => (
                <span
                  key={index}
                  className="bouncing-letter"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  {letter}
                </span>
              ))}
            </span>
          </h1>
        </div>

        <div className="absolute bottom-[30px] right-[150px] bg-pink-800 h-[600px] w-[450px] border-4 border-pink-900 rounded-3xl flex flex-col">
          <div className="flex justify-between items-center px-6 py-4">
            <h1 className="text-white bungee-regular text-2xl">
              Progress Logs
            </h1>
            {logs.length > 0 && (
              <button
                onClick={() => setLogs([])}
                className="px-3 py-1 bg-pink-700 hover:bg-pink-600 text-white text-sm rounded-md transition-colors"
              >
                Clear Logs
              </button>
            )}
          </div>

          {detailedProgress.total > 0 && (
            <div className="mx-6 mb-4 p-3 bg-pink-900/70 rounded-lg border border-pink-700">
              <div className="text-white text-sm mb-1">
                <span className="font-semibold">Current Task:</span>{' '}
                {detailedProgress.itemName}
              </div>
              <div className="text-white text-sm mb-2">
                <span className="font-semibold">Progress:</span>{' '}
                {detailedProgress.current} of {detailedProgress.total} (
                {detailedProgress.percentage}%)
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div
                  className="h-2 rounded-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${detailedProgress.percentage}%` }}
                ></div>
              </div>
            </div>
          )}

          <div className="bg-pink-200/30 h-[480px] w-[380px] border-4 border-pink-300 rounded-3xl mx-auto overflow-hidden">
            <div className="h-full overflow-y-auto p-4">
              {logs.length === 0 ? (
                <div className="text-white text-center mt-10">
                  <p>No logs yet.</p>
                  <p className="text-sm mt-2">
                    Start duplication to see real-time progress here.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {logs.map((log, index) => (
                    <div
                      key={index}
                      className={`text-sm font-mono p-2 rounded bg-black/20 ${getLogTypeColor(log.type)}`}
                    >
                      <div className="flex items-start">
                        <span className="text-gray-400 text-xs min-w-[70px]">
                          {log.timestamp}
                        </span>
                        <span className="mx-2 font-bold">
                          {formatLogType(log.type)}
                        </span>
                        <span className="flex-1">{log.message}</span>
                      </div>
                    </div>
                  ))}
                  <div ref={logsEndRef} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Duplication
