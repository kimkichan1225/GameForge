import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { registerRoomHandlers } from './socket/roomHandlers.js';

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
    methods: ['GET', 'POST'],
  },
});

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/', (_req, res) => {
  res.json({ status: 'ok', message: 'GameForge Server Running' });
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`클라이언트 연결됨: ${socket.id}`);

  // Register room handlers
  registerRoomHandlers(io, socket);
});

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다`);
  console.log(`http://localhost:${PORT}`);
});
