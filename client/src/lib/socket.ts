import { io, Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';

class SocketManager {
  private socket: Socket | null = null;
  private connectionListeners: ((connected: boolean) => void)[] = [];

  connect(): Socket {
    if (this.socket?.connected) {
      return this.socket;
    }

    this.socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });

    this.socket.on('connect', () => {
      console.log('서버에 연결됨:', this.socket?.id);
      this.notifyListeners(true);
    });

    this.socket.on('disconnect', () => {
      console.log('서버 연결 해제');
      this.notifyListeners(false);
    });

    this.socket.on('connect_error', (error) => {
      console.error('연결 오류:', error.message);
    });

    return this.socket;
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  onConnectionChange(listener: (connected: boolean) => void): () => void {
    this.connectionListeners.push(listener);
    return () => {
      this.connectionListeners = this.connectionListeners.filter((l) => l !== listener);
    };
  }

  private notifyListeners(connected: boolean): void {
    this.connectionListeners.forEach((listener) => listener(connected));
  }
}

export const socketManager = new SocketManager();
export type { Socket };
