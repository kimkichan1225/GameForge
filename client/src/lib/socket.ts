import { io, Socket } from 'socket.io-client';

// 프로덕션에서는 같은 origin 사용 (빈 문자열 = 현재 호스트)
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ||
  (import.meta.env.PROD ? '' : 'http://localhost:3001');

// HMR 시 소켓 중복 연결 방지를 위해 전역에 저장
declare global {
  interface Window {
    __gameforge_socket?: Socket;
    __gameforge_socket_connecting?: boolean;
  }
}

class SocketManager {
  private socket: Socket | null = null;
  private connectionListeners: ((connected: boolean) => void)[] = [];

  connect(): Socket {
    // HMR로 인한 중복 연결 방지: 전역에 저장된 소켓 사용
    if (window.__gameforge_socket?.connected) {
      this.socket = window.__gameforge_socket;
      return this.socket;
    }

    // 연결 중인 상태면 기존 소켓 반환
    if (window.__gameforge_socket_connecting && window.__gameforge_socket) {
      this.socket = window.__gameforge_socket;
      return this.socket;
    }

    // 기존 소켓이 존재하지만 연결이 끊어진 경우 정리
    if (window.__gameforge_socket && !window.__gameforge_socket.connected) {
      window.__gameforge_socket.removeAllListeners();
      window.__gameforge_socket.disconnect();
      window.__gameforge_socket = undefined;
    }

    // 이미 소켓이 존재하고 연결되어 있으면 반환
    if (this.socket?.connected) {
      return this.socket;
    }

    window.__gameforge_socket_connecting = true;

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
      window.__gameforge_socket_connecting = false;
      this.notifyListeners(true);
    });

    this.socket.on('disconnect', () => {
      this.notifyListeners(false);
    });

    this.socket.on('connect_error', () => {
      window.__gameforge_socket_connecting = false;
    });

    return this.socket;
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    window.__gameforge_socket = undefined;
    window.__gameforge_socket_connecting = false;
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
