(() => {
  'use strict';

  // ===== GERENCIAMENTO DE WEBSOCKET =====
  let ws = null;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_DELAY = 3000;

  function initWebSocket() {
    if (ws && ws.readyState === WebSocket.OPEN) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('✅ WebSocket conectado');
        reconnectAttempts = 0;
        
        // Enviar autenticação
        if (window.state && window.state.sync && window.state.sync.userId) {
          ws.send(JSON.stringify({
            type: 'auth',
            userId: window.state.sync.userId
          }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          handleWebSocketMessage(message);
        } catch (error) {
          console.error('Erro ao processar mensagem WebSocket:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('❌ Erro WebSocket:', error);
      };

      ws.onclose = () => {
        console.log('📴 WebSocket desconectado');
        attemptReconnect();
      };
    } catch (error) {
      console.error('Erro ao conectar WebSocket:', error);
      attemptReconnect();
    }
  }

  function attemptReconnect() {
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      console.log(`🔄 Tentando reconectar... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
      setTimeout(() => initWebSocket(), RECONNECT_DELAY * reconnectAttempts);
    } else {
      console.warn('⚠️ Máximo de tentativas de reconexão atingido');
      Toast.warning('Conexão perdida. Tente recarregar a página.');
    }
  }

  function handleWebSocketMessage(message) {
    switch (message.type) {
      case 'dataUpdate':
        // Atualizar dados quando outro dispositivo faz mudanças
        if (message.source !== getClientId()) {
          console.log('📱 Dados atualizados de outro dispositivo');
          Object.assign(state, message.data);
          save('Sincronizado de outro dispositivo');
          renderAll();
          Toast.info('📱 Dados sincronizados de outro dispositivo');
        }
        break;

      case 'backupSync':
        console.log('☁️ Backup sincronizado:', message.fileId);
        state.sync.lastBackup = new Date(message.timestamp).toLocaleString('pt-BR');
        renderAll();
        Toast.info('☁️ Backup sincronizado em outro dispositivo');
        break;

      case 'notification':
        Toast.info(message.message);
        break;

      default:
        console.log('Mensagem recebida:', message);
    }
  }

  function sendWebSocketMessage(type, payload) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type,
        userId: window.state?.sync?.userId,
        payload,
        timestamp: Date.now()
      }));
    } else {
      console.warn('⚠️ WebSocket não está conectado');
    }
  }

  function getClientId() {
    let clientId = localStorage.getItem('clientId');
    if (!clientId) {
      clientId = `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem('clientId', clientId);
    }
    return clientId;
  }

  // ===== INTEGRAÇÃO COM APP PRINCIPAL =====
  const originalSave = window.save;
  window.save = function(status = 'Salvo localmente') {
    // Chamar função original
    if (originalSave) originalSave.call(this, status);

    // Sincronizar via WebSocket
    if (window.state) {
      sendWebSocketMessage('dataSync', window.state);
    }
  };

  // Substituir função de backup
  const originalBackup = window.uploadBackup;
  window.uploadBackup = async function() {
    const result = await originalBackup.call(this);
    if (result) {
      // Notificar outros dispositivos
      sendWebSocketMessage('backup', {
        fileId: window.state.sync.driveFileId,
        timestamp: new Date().toISOString()
      });
    }
    return result;
  };

  // Exportar funções
  window.initWebSocket = initWebSocket;
  window.sendWebSocketMessage = sendWebSocketMessage;
})();