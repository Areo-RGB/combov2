const WebSocket = require('ws');
const os = require('os');

// Configuration
const PORT = 8080;
const HOST = '0.0.0.0';
const HEARTBEAT_TIMEOUT = 30000; // 30 seconds

// Client storage
const clients = new Map();

/**
 * Get local IP address
 */
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

/**
 * Create WebSocket server
 */
const wss = new WebSocket.Server({
  port: PORT,
  host: HOST,
});

const localIP = getLocalIP();

console.log(`
╔════════════════════════════════════════════════════════════╗
║       Sprint Timer WebSocket Server                       ║
╠════════════════════════════════════════════════════════════╣
║  Status: Running                                           ║
║  Port: ${PORT}                                                  ║
║  Local IP: ${localIP.padEnd(44)} ║
║  Connection URL: ws://${localIP}:${PORT}${' '.repeat(22 - localIP.length)} ║
╠════════════════════════════════════════════════════════════╣
║  Instructions:                                             ║
║  1. Connect splits to: ws://${localIP}:${PORT}${' '.repeat(14 - localIP.length)} ║
║  2. Each split should use a unique split number            ║
║  3. Master view will display all connected splits          ║
╚════════════════════════════════════════════════════════════╝
`);

/**
 * Broadcast message to all clients
 */
function broadcastToAll(message) {
  const data = JSON.stringify(message);
  clients.forEach((client) => {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(data);
    }
  });
}

/**
 * Broadcast message to specific client
 */
function sendToClient(clientId, message) {
  const client = clients.get(clientId);
  if (client && client.ws.readyState === WebSocket.OPEN) {
    client.ws.send(JSON.stringify(message));
  }
}

/**
 * Get clients list (without WebSocket objects for serialization)
 */
function getClientsList() {
  return Array.from(clients.values()).map((client) => ({
    id: client.id,
    splitNumber: client.splitNumber,
    ipAddress: client.ipAddress,
    connectedAt: client.connectedAt,
    lastSeen: client.lastHeartbeat,
  }));
}

/**
 * Broadcast clients update to all
 */
function broadcastClientsUpdate() {
  broadcastToAll({
    type: 'clients-update',
    timestamp: Date.now(),
    data: {
      totalClients: clients.size,
      clients: getClientsList(),
    },
  });
}

/**
 * Handle client disconnection
 */
function handleDisconnect(clientId) {
  const client = clients.get(clientId);
  if (client) {
    console.log(
      `[${new Date().toLocaleTimeString()}] Client disconnected: Split ${client.splitNumber} (${client.ipAddress})`
    );
    clients.delete(clientId);
    broadcastClientsUpdate();
  }
}

/**
 * Handle heartbeat timeout
 */
function checkHeartbeats() {
  const now = Date.now();
  clients.forEach((client, clientId) => {
    if (now - client.lastHeartbeat > HEARTBEAT_TIMEOUT) {
      console.log(
        `[${new Date().toLocaleTimeString()}] Heartbeat timeout for Split ${client.splitNumber}`
      );
      client.ws.close();
      handleDisconnect(clientId);
    }
  });
}

// Check heartbeats every 10 seconds
setInterval(checkHeartbeats, 10000);

/**
 * Handle WebSocket connections
 */
wss.on('connection', (ws, req) => {
  const clientIP = req.socket.remoteAddress;
  let clientId = null;

  console.log(`[${new Date().toLocaleTimeString()}] New connection from ${clientIP}`);

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case 'register':
          // Register a new client
          clientId = message.clientId || `client-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

          clients.set(clientId, {
            id: clientId,
            splitNumber: message.splitNumber || 0,
            ws: ws,
            ipAddress: clientIP,
            connectedAt: Date.now(),
            lastHeartbeat: Date.now(),
          });

          console.log(
            `[${new Date().toLocaleTimeString()}] Split ${message.splitNumber} registered (${clientIP})`
          );

          // Send welcome message
          sendToClient(clientId, {
            type: 'welcome',
            timestamp: Date.now(),
            data: {
              clientId: clientId,
              assignedSplitNumber: message.splitNumber,
              serverTime: Date.now(),
            },
          });

          // Broadcast updated clients list
          broadcastClientsUpdate();
          break;

        case 'detection-event':
          // Forward detection event to all clients (including master)
          console.log(
            `[${new Date().toLocaleTimeString()}] Detection from Split ${message.splitNumber} (intensity: ${message.detectionData?.intensity || 'N/A'})`
          );

          broadcastToAll({
            type: 'detection-broadcast',
            fromSplit: message.splitNumber,
            clientId: message.clientId,
            timestamp: message.timestamp || Date.now(),
            detectionData: message.detectionData,
          });
          break;

        case 'heartbeat':
          // Update last heartbeat time
          if (clientId && clients.has(clientId)) {
            clients.get(clientId).lastHeartbeat = Date.now();
          }
          break;

        default:
          console.log(`[${new Date().toLocaleTimeString()}] Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error('Error processing message:', error);
      ws.send(
        JSON.stringify({
          type: 'error',
          timestamp: Date.now(),
          data: {
            message: 'Failed to process message',
            error: error.message,
          },
        })
      );
    }
  });

  ws.on('close', () => {
    if (clientId) {
      handleDisconnect(clientId);
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    if (clientId) {
      handleDisconnect(clientId);
    }
  });
});

/**
 * Handle server errors
 */
wss.on('error', (error) => {
  console.error('WebSocket Server error:', error);
});

/**
 * Graceful shutdown
 */
process.on('SIGINT', () => {
  console.log('\n[Server] Shutting down gracefully...');

  // Close all client connections
  clients.forEach((client) => {
    client.ws.close();
  });

  // Close the server
  wss.close(() => {
    console.log('[Server] Server closed');
    process.exit(0);
  });
});

console.log('[Server] WebSocket server is ready to accept connections\n');
