// WebSocket Synchronization Module
// Sincronização em tempo real entre abas/dispositivos via WebSocket

class WebSocketSync {
  constructor() {
    this.ws = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 2000;
    this.messageQueue = [];
    this.listeners = new Map();
    this.closedByUser = false;
    this.reconnectTimer = null;
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      // Ensure path /ws is included
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      console.log('🔗 Conectando ao WebSocket:', wsUrl);
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => this.handleOpen();
      this.ws.onmessage = (event) => this.handleMessage(event);
      this.ws.onerror = (error) => this.handleError(error);
      this.ws.onclose = (ev) => this.handleClose(ev);

      // If the page is unloaded, make sure to close socket gracefully
      window.addEventListener('beforeunload', () => this.disconnect(true));
      window.addEventListener('pagehide', () => this.disconnect(true));
    } catch (error) {
      console.error('❌ Erro ao conectar WebSocket:', error && (error.stack || error));
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
      if (!event || !event.data) return;
      let data;
      try {
        data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      } catch (e) {
        console.warn('Mensagem WS com formato inesperado, ignorando', e);
        return;
      }

      console.log('📨 Mensagem recebida:', data);

      // Emitir para listeners específicos
      if (data && data.type) {
        this.emit(data.type, data);
      }

      // Sincronizar dados se necessário
      if (data && data.type === 'sync-update' && data.collection) {
        try { this.syncLocalData(data); } catch (e) { console.error('Erro ao aplicar syncLocalData:', e); }
      }

      // Notificar todas as abas abertas
      if (window.BroadcastChannel) {
        try {
          const bc = new BroadcastChannel('financeiro-sync');
          bc.postMessage(data);
        } catch (e) {
          console.warn('BroadcastChannel indisponível:', e);
        }
      }
    } catch (error) {
      console.error('❌ Erro ao processar mensagem WebSocket:', error && (error.stack || error));
    }
  }

  handleError(error) {
    console.error('❌ Erro WebSocket:', error && (error.stack || error));
    this.emit('error', error);
  }

  handleClose(ev) {
    console.log('❌ WebSocket desconectado', ev && ev.code);
    this.isConnected = false;
    this.emit('disconnected', { timestamp: new Date(), code: ev && ev.code });

    if (!this.closedByUser) this.scheduleReconnect();
  }

  send(message) {
    const payload = (typeof message === 'string') ? message : JSON.stringify(message);
    if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(payload);
        try {
          const parsed = typeof message === 'object' ? message : JSON.parse(message);
          console.log('📤 Mensagem enviada:', parsed.type || '(sem tipo)');
        } catch (_) {
          console.log('📤 Mensagem enviada');
        }
      } catch (error) {
        console.error('❌ Erro ao enviar mensagem:', error && (error.stack || error));
        this.messageQueue.push(message);
      }
    } else {
      console.warn('⚠️ WebSocket não conectado, enfileirando mensagem');
      this.messageQueue.push(message);
    }
  }

  scheduleReconnect() {
    if (this.closedByUser) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ Falha ao reconectar após múltiplas tentativas');
      this.emit('reconnect_failed');
      return;
    }
    this.reconnectAttempts++;
    const delay = Math.min(30000, this.reconnectDelay * this.reconnectAttempts);
    console.log(`⏳ Reconectando em ${delay}ms... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  // Sincronizar dados locais com servidor
  syncLocalData(data) {
    if (!data || !data.collection) return;

    const collection = data.collection;
    const items = Array.isArray(data.items) ? data.items : [];

    // Recuperar dados locais com segurança
    let localData = [];
    try {
      localData = JSON.parse(localStorage.getItem(collection) || '[]');
      if (!Array.isArray(localData)) localData = [];
    } catch (e) {
      console.warn('Erro ao ler localStorage para sincronização, usando array vazio', e);
      localData = [];
    }

    if (data.action === 'update') {
      // Mesclar dados
      items.forEach(remoteItem => {
        try {
          const localIndex = localData.findIndex(item => item && item.id === remoteItem.id);
          if (localIndex >= 0) {
            localData[localIndex] = { ...localData[localIndex], ...remoteItem, syncedAt: new Date().toISOString() };
          } else {
            localData.push({ ...remoteItem, syncedAt: new Date().toISOString() });
          }
        } catch (e) {
          console.warn('Item de sincronização inválido:', remoteItem, e);
        }
      });
    } else if (data.action === 'delete') {
      items.forEach(remoteItem => {
        try {
          const index = localData.findIndex(item => item && item.id === remoteItem.id);
          if (index >= 0) localData.splice(index, 1);
        } catch (e) {
          console.warn('Erro ao aplicar delete sync:', remoteItem, e);
        }
      });
    }

    try {
      localStorage.setItem(collection, JSON.stringify(localData));
      console.log(`✅ ${collection} sincronizado (${items.length} itens)`);
    } catch (e) {
      console.error('Erro ao salvar dados sincronizados no localStorage:', e && (e.stack || e));
    }

    // Atualizar UI
    try {
      window.dispatchEvent(new CustomEvent('data-synced', { detail: { collection, items } }));
    } catch (e) {
      console.warn('Erro ao dispatch data-synced:', e);
    }
  }

  // Publicar evento de sincronização
  publishSync(collection, action, items) {
    try {
      this.send({
        type: 'sync-update',
        collection,
        action,
        items,
        timestamp: new Date().toISOString()
      });
    } catch (e) {
      console.error('Erro ao publicar sync:', e && (e.stack || e));
    }
  }

  // Sistema de eventos
  on(eventName, callback) {
    if (!this.listeners.has(eventName)) this.listeners.set(eventName, []);
    this.listeners.get(eventName).push(callback);
  }

  off(eventName, callback) {
    if (this.listeners.has(eventName)) {
      const callbacks = this.listeners.get(eventName);
      const index = callbacks.indexOf(callback);
      if (index > -1) callbacks.splice(index, 1);
    }
  }

  emit(eventName, data) {
    if (this.listeners.has(eventName)) {
      this.listeners.get(eventName).forEach(callback => {
        try { callback(data); } catch (error) { console.error(`❌ Erro ao executar listener para ${eventName}:`, error && (error.stack || error)); }
      });
    }
  }

  disconnect(userInitiated = false) {
    this.closedByUser = !!userInitiated;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try {
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }
    } catch (e) {
      console.warn('Erro ao desconectar WebSocket:', e);
    }
    this.isConnected = false;
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

  window.wsSync.on('reconnect_failed', () => {
    const statusEl = document.getElementById('saveStatus');
    if (statusEl) {
      statusEl.textContent = '🔌 Reconexão falhou';
      statusEl.style.color = 'var(--color-error)';
    }
  });

  // Sincronizar quando dados são salvos localmente
  window.addEventListener('data-saved', (event) => {
    try {
      const { collection, action, items } = event.detail || {};
      window.wsSync.publishSync(collection, action, items);
    } catch (e) {
      console.warn('Evento data-saved inválido', e);
    }
  });

  // Sincronizar entre abas
  if (window.BroadcastChannel) {
    try {
      const bc = new BroadcastChannel('financeiro-sync');
      bc.onmessage = (event) => {
        const data = event.data;
        console.log('📨 Mensagem de outra aba:', data);

        if (data && data.type === 'sync-update' && data.collection) {
          window.wsSync.syncLocalData(data);
        }
      };
    } catch (e) {
      console.warn('Não foi possível criar BroadcastChannel:', e);
    }
  }
}

// Exportar para uso global
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WebSocketSync, initWebSocket };
}
