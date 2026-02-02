import { io, Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';

// HMR 시 소켓 중복 연결 방지를 위해 전역에 저장
declare global {
  interface Window {
    __gameforge_socket?: Socket;
  }
}

class SocketManager {
  private socket: Socket | null = null;
  private connectionListeners: ((connected: boolean) => void)[] = [];

  connect(): Socket {
    // HMR로 인한 중복 연결 방지: 전역에 저장된 소켓 사용
    if (window.__gameforge_socket) {
      this.socket = window.__gameforge_socket;
      return this.socket;
    }

    // 이미 소켓이 존재하면 기존 소켓 반환
    if (this.socket) {
      return this.socket;
    }

    this.socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    // 전역에 저장
    window.__gameforge_socket = this.socket;

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
      window.__gameforge_socket = undefined;
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
