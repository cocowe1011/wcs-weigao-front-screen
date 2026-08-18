const WS_PORT = 8081;
const HEARTBEAT_INTERVAL = 15000;
const MIN_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 10000;

function getWebSocketUrl() {
  const httpBase = process.env.VUE_APP_BASE_URL || 'http://localhost:7005';
  try {
    const parsed = new URL(httpBase);
    return `ws://${parsed.hostname}:${WS_PORT}`;
  } catch (error) {
    console.error('解析 WebSocket 地址失败:', error);
    return `ws://localhost:${WS_PORT}`;
  }
}

class AlarmWebSocketClient {
  constructor(config = {}) {
    this.url = config.url || getWebSocketUrl();
    this.ws = null;
    this.isConnected = false;
    this.stopped = false;
    this.handlingClose = false;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.heartbeatInterval = null;
    this.onConnected = config.onConnected || null;
    this.onDisconnected = config.onDisconnected || null;
    this.onAlarmReceived = config.onAlarmReceived || null;
    this.onError = config.onError || null;
    this._onOnline = this.handleOnline.bind(this);
  }

  connect() {
    if (this.stopped) return;
    this.handlingClose = false;
    this.clearReconnectTimer();
    this.closeSocketSilent();

    try {
      console.log(`尝试连接 WebSocket 服务器: ${this.url}`);
      const WS =
        typeof window !== 'undefined' && window.WebSocket
          ? window.WebSocket
          : WebSocket;
      this.ws = new WS(this.url);

      this.ws.onopen = () => {
        console.log('WebSocket 连接已建立');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.register();
        this.startHeartbeat();
        if (this.onConnected) {
          this.onConnected();
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch (error) {
          console.error('解析消息失败:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket 错误:', error);
        if (this.onError) {
          this.onError(error);
        }
        this.handleSocketClosed();
      };

      this.ws.onclose = (event) => {
        console.log('WebSocket 连接已关闭:', event.code, event.reason);
        this.handleSocketClosed();
      };
    } catch (error) {
      console.error('WebSocket 连接失败:', error);
      if (this.onError) {
        this.onError(error);
      }
      this.handleSocketClosed();
    }
  }

  start() {
    this.stopped = false;
    window.addEventListener('online', this._onOnline);
    this.connect();
  }

  register() {
    this.send({ type: 'register' });
  }

  handleMessage(data) {
    switch (data.type) {
      case 'connected':
      case 'registered':
      case 'pong':
        break;
      case 'alarm':
        this.handleAlarmMessage(data);
        break;
      default:
        break;
    }
  }

  handleAlarmMessage(data) {
    const payload = data && data.data ? data.data : {};
    const alarmLog = {
      id: payload.id,
      message: payload.message,
      timestamp: payload.timestamp,
      source: payload.source,
      type: payload.type,
      receivedAt: new Date().toISOString(),
      unread: true
    };
    if (this.onAlarmReceived) {
      this.onAlarmReceived(alarmLog);
    }
  }

  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      return true;
    }
    return false;
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        this.handleSocketClosed();
        return;
      }
      this.send({ type: 'ping' });
    }, HEARTBEAT_INTERVAL);
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  handleSocketClosed() {
    if (this.stopped || this.handlingClose) return;
    this.handlingClose = true;
    const wasConnected = this.isConnected;
    this.isConnected = false;
    this.stopHeartbeat();
    this.closeSocketSilent();
    if (wasConnected && this.onDisconnected) {
      this.onDisconnected();
    }
    this.scheduleReconnect();
  }

  scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) return;
    const delay = Math.min(
      MIN_RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts),
      MAX_RECONNECT_DELAY
    );
    this.reconnectAttempts += 1;
    console.log(
      `WebSocket 将在 ${delay}ms 后重连（第 ${this.reconnectAttempts} 次）`
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  handleOnline() {
    if (this.stopped || this.isConnected) return;
    console.log('网络已恢复，立即重连 WebSocket');
    this.reconnectAttempts = 0;
    this.connect();
  }

  closeSocketSilent() {
    if (!this.ws) return;
    this.ws.onopen = null;
    this.ws.onmessage = null;
    this.ws.onerror = null;
    this.ws.onclose = null;
    if (
      this.ws.readyState === WebSocket.OPEN ||
      this.ws.readyState === WebSocket.CONNECTING
    ) {
      try {
        this.ws.close();
      } catch (error) {
        console.error('关闭旧 WebSocket 失败:', error);
      }
    }
    this.ws = null;
  }

  clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  disconnect() {
    this.stopped = true;
    window.removeEventListener('online', this._onOnline);
    this.clearReconnectTimer();
    this.stopHeartbeat();
    this.closeSocketSilent();
    this.isConnected = false;
  }
}

export { getWebSocketUrl };
export default AlarmWebSocketClient;
