// WebSocket Synchronization Module
// Sincronização em tempo real entre abas/dispositivos via WebSocket

class WebSocketSync {
  constructor() {
    this.ws = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 3000;
    this.messageQueue = [];
    this.listeners = new Map();
  }

  connect() {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}`;
      
      console.log('🔗 Conectando ao WebSocket:', wsUrl);
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => this.handleOpen();
      this.ws.onmessage = (event) => this.handleMessage(event);
      this.ws.onerror = (error) => this.handleError(error);
      this.ws.onclose = () => this.handleClose();
    } catch (error) {
      console.error('❌ Erro ao conectar WebSocket:', error);
      this.scheduleReconnect();
    }
  }

  handleOpen() {
    console.log('✅ WebSocket conectado');
    this.isConnected = true;
    this.reconnectAttempts = 0;

    // Enviar mensagens pendentes
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      this.send(message);
    }

    // Notificar listeners
    this.emit('connected', { timestamp: new Date() });
  }

  handleMessage(event) {
    try {
      const data = JSON.parse(event.data);
      console.log('📨 Mensagem recebida:', data);

      // Emitir para listeners específicos
      if (data.type) {
        this.emit(data.type, data);
      }

      // Sincronizar dados se necessário
      if (data.type === 'sync-update' && data.collection) {
        this.syncLocalData(data);
      }

      // Notificar todas as abas abertas
      if (window.BroadcastChannel) {
        const bc = new BroadcastChannel('financeiro-sync');
        bc.postMessage(data);
      }
    } catch (error) {
      console.error('❌ Erro ao processar mensagem WebSocket:', error);
    }
  }

  handleError(error) {
    console.error('❌ Erro WebSocket:', error);
    this.emit('error', error);
  }

  handleClose() {
    console.log('❌ WebSocket desconectado');
    this.isConnected = false;
    this.emit('disconnected', { timestamp: new Date() });
    this.scheduleReconnect();
  }

  send(message) {
    if (this.isConnected && this.ws) {
      try {
        this.ws.send(JSON.stringify(message));
        console.log('📤 Mensagem enviada:', message.type);
      } catch (error) {
        console.error('❌ Erro ao enviar mensagem:', error);
        this.messageQueue.push(message);
      }
    } else {
      console.warn('⚠️ WebSocket não conectado, enfileirando mensagem');
      this.messageQueue.push(message);
    }
  }

  scheduleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * this.reconnectAttempts;
      console.log(`⏳ Reconectando em ${delay}ms... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      setTimeout(() => this.connect(), delay);
    } else {
      console.error('❌ Falha ao reconectar após múltiplas tentativas');
    }
  }

  // Sincronizar dados locais com servidor
  syncLocalData(data) {
    if (!data.collection) return;

    const collection = data.collection;
    const items = data.items || [];

    // Recuperar dados locais
    const localData = JSON.parse(localStorage.getItem(collection) || '[]');

    if (data.action === 'update') {
      // Mesclar dados
      items.forEach(remoteItem => {
        const localIndex = localData.findIndex(item => item.id === remoteItem.id);
        if (localIndex >= 0) {
          localData[localIndex] = { ...localData[localIndex], ...remoteItem, syncedAt: new Date().toISOString() };
        } else {
          localData.push({ ...remoteItem, syncedAt: new Date().toISOString() });
        }
      });
    } else if (data.action === 'delete') {
      items.forEach(remoteItem => {
        const index = localData.findIndex(item => item.id === remoteItem.id);
        if (index >= 0) {
          localData.splice(index, 1);
        }
      });
    }

    localStorage.setItem(collection, JSON.stringify(localData));
    console.log(`✅ ${collection} sincronizado (${items.length} itens)`);

    // Atualizar UI
    window.dispatchEvent(new CustomEvent('data-synced', { detail: { collection, items } }));
  }

  // Publicar evento de sincronização
  publishSync(collection, action, items) {
    this.send({
      type: 'sync-update',
      collection,
      action,
      items,
      timestamp: new Date().toISOString()
    });
  }

  // Sistema de eventos
  on(eventName, callback) {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, []);
    }
    this.listeners.get(eventName).push(callback);
  }

  off(eventName, callback) {
    if (this.listeners.has(eventName)) {
      const callbacks = this.listeners.get(eventName);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  emit(eventName, data) {
    if (this.listeners.has(eventName)) {
      this.listeners.get(eventName).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`❌ Erro ao executar listener para ${eventName}:`, error);
        }
      });
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  getStatus() {
    return {
      connected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      queuedMessages: this.messageQueue.length
    };
  }
}

// Instância global
window.wsSync = new WebSocketSync();

// Inicializar WebSocket
function initWebSocket() {
  console.log('🚀 Inicializando WebSocket Sync');
  window.wsSync.connect();

  // Atualizar status na UI
  window.wsSync.on('connected', () => {
    const statusEl = document.getElementById('saveStatus');
    if (statusEl) {
      statusEl.textContent = '🔗 Sincronizado';
      statusEl.style.color = 'var(--color-success)';
    }
  });

  window.wsSync.on('disconnected', () => {
    const statusEl = document.getElementById('saveStatus');
    if (statusEl) {
      statusEl.textContent = '⚠️ Offline';
      statusEl.style.color = 'var(--color-warning)';
    }
  });

  // Sincronizar quando dados são salvos localmente
  window.addEventListener('data-saved', (event) => {
    const { collection, action, items } = event.detail;
    window.wsSync.publishSync(collection, action, items);
  });

  // Sincronizar entre abas
  if (window.BroadcastChannel) {
    const bc = new BroadcastChannel('financeiro-sync');
    bc.onmessage = (event) => {
      const data = event.data;
      console.log('📨 Mensagem de outra aba:', data);
      
      if (data.type === 'sync-update' && data.collection) {
        window.wsSync.syncLocalData(data);
      }
    };
  }
}

// Exportar para uso global
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WebSocketSync, initWebSocket };
}
