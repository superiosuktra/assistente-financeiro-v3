(() => {
  'use strict';

  const STORAGE_KEY = 'financeiro-v3-data';
  const API_BASE = '/api';
  const DEFAULT_BACKUP_NAME = 'assistente-financeiro-backup.json';

  // ===== UTILITÁRIOS =====
  const qs = (selector, root = document) => root && root.querySelector ? root.querySelector(selector) : null;
  const qsa = (selector, root = document) => root && root.querySelectorAll ? Array.from(root.querySelectorAll(selector)) : [];
  const on = (selector, event, handler) => {
    const element = qs(selector);
    if (element) element.addEventListener(event, handler);
  };

  const uid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const todayIso = () => new Date().toISOString().slice(0, 10);
  const currentMonthKey = () => todayIso().slice(0, 7);
  const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));

  // ===== TOAST NOTIFICATIONS =====
  const Toast = {
    container() {
      return qs('#toastContainer') || (function create() {
        try {
          const c = document.createElement('div');
          c.id = 'toastContainer';
          document.body.appendChild(c);
          return c;
        } catch (e) {
          // fallback: no DOM available
          return null;
        }
      })();
    },
    show(message, type = 'info', duration = 4000) {
      const container = Toast.container();
      if (!container) return console.log(`[Toast ${type}] ${message}`);
      const toast = document.createElement('div');
      toast.className = `toast ${type}`;
      toast.textContent = message;
      container.appendChild(toast);

      setTimeout(() => {
        try {
          toast.style.animation = 'slideIn .3s ease-out reverse';
          setTimeout(() => toast.remove(), 300);
        } catch (e) {
          toast.remove();
        }
      }, duration);
    },
    success: (msg) => Toast.show(msg, 'success'),
    error: (msg) => Toast.show(msg, 'error'),
    warning: (msg) => Toast.show(msg, 'warning'),
    info: (msg) => Toast.show(msg, 'info')
  };

  // ===== STATE MANAGEMENT =====
  const defaultState = () => ({
    sync: { connected: false, lastBackup: null, email: '', driveFileId: '' },
    transactions: [
      { id: uid(), type: 'income', description: 'Honorários', category: 'Clientes', expenseKind: '-', date: '2026-05-03', amount: 4200 },
      { id: uid(), type: 'income', description: 'Consultoria', category: 'Serviços', expenseKind: '-', date: '2026-05-09', amount: 1800 },
      { id: uid(), type: 'expense', description: 'Aluguel', category: 'Fixos', expenseKind: 'Essencial', date: '2026-05-05', amount: 1200 },
      { id: uid(), type: 'expense', description: 'Mercado', category: 'Alimentação', expenseKind: 'Essencial', date: '2026-05-14', amount: 420 },
      { id: uid(), type: 'expense', description: 'Internet', category: 'Serviços', expenseKind: 'Trabalho', date: '2026-05-10', amount: 130 },
      { id: uid(), type: 'expense', description: 'Combustível', category: 'Transporte', expenseKind: 'Essencial', date: '2026-05-16', amount: 210 }
    ],
    reminders: [
      { id: uid(), title: 'Energia', dueDate: '2026-05-24', amount: 145.8 },
      { id: uid(), title: 'Água', dueDate: '2026-05-23', amount: 78.2 },
      { id: uid(), title: 'Cartão', dueDate: '2026-05-25', amount: 980.3 }
    ]
  });

  function loadState() {
    const base = defaultState();
    try {
      const savedRaw = localStorage.getItem(STORAGE_KEY);
      if (!savedRaw) return base;
      const saved = JSON.parse(savedRaw || 'null');
      if (!saved || typeof saved !== 'object') return base;
      return normalizeState({ ...base, ...saved });
    } catch (error) {
      console.warn('Erro ao carregar dados:', error && (error.stack || error));
      Toast.warning('Usando dados padrão');
      return base;
    }
  }

  function normalizeState(data) {
    data.transactions = (data.transactions || []).map(item => ({
      id: item.id || uid(),
      type: item.type === 'expense' ? 'expense' : 'income',
      description: String(item.description || '').trim(),
      category: String(item.category || '').trim(),
      expenseKind: item.expenseKind || '-',
      date: item.date || todayIso(),
      amount: Math.max(0, Number(item.amount) || 0)
    }));
    data.reminders = (data.reminders || []).map(item => ({
      id: item.id || uid(),
      title: String(item.title || 'Conta').trim(),
      dueDate: item.dueDate || todayIso(),
      amount: Math.max(0, Number(item.amount) || 0)
    }));
    data.sync = { connected: false, lastBackup: null, email: '', driveFileId: '', ...(data.sync || {}) };
    return data;
  }

  let state = loadState();
  let cashChart = null;
  let categoryChart = null;

  function save(status = 'Salvo localmente') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      const saveStatus = qs('#saveStatus');
      if (saveStatus) saveStatus.textContent = status;
    } catch (error) {
      Toast.error('Erro ao salvar dados locais');
      console.error('Erro ao salvar localStorage:', error && (error.stack || error));
    }
  }

  // ===== API CALLS =====
  async function apiCall(endpoint, method = 'GET', body = null) {
    try {
      const options = {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      };
      if (body) options.body = JSON.stringify(body);

      const response = await fetch(`/api${endpoint}`, options);
      const contentType = response.headers.get('content-type') || '';
      if (!response.ok) {
        let errorText = `HTTP ${response.status}`;
        try {
          if (contentType.includes('application/json')) {
            const error = await response.json();
            errorText = error.error || error.message || errorText;
          } else {
            const text = await response.text();
            errorText = text || errorText;
          }
        } catch (e) {
          // ignore
        }
        throw new Error(errorText);
      }

      if (contentType.includes('application/json')) return await response.json();
      return await response.text();
    } catch (error) {
      Toast.error(error.message || 'Erro na requisição');
      throw error;
    }
  }

  async function checkAuthStatus() {
    try {
      const result = await apiCall('/auth/status');
      if (result && result.authenticated) {
        state.sync.connected = true;
        state.sync.email = result.user.email;
        const c1 = qs('#connectGoogle'); if (c1) c1.style.display = 'none';
        const c2 = qs('#connectGoogle2'); if (c2) c2.style.display = 'none';
        const b = qs('#backupNow'); if (b) b.style.display = 'block';
        const l = qs('#logoutBtn'); if (l) l.style.display = 'block';
        save();
      }
    } catch (error) {
      // Silencioso - usuário não autenticado ou erro
    }
  }

  async function startGoogleAuth() {
    try {
      const result = await apiCall('/auth/google');
      if (result && result.authUrl) window.location.href = result.authUrl;
    } catch (error) {
      Toast.error('Erro ao iniciar autenticação');
    }
  }

  async function logout() {
    try {
      await apiCall('/auth/logout', 'GET');
      state.sync.connected = false;
      state.sync.email = '';
      state.sync.driveFileId = '';
      const c1 = qs('#connectGoogle'); if (c1) c1.style.display = 'block';
      const c2 = qs('#connectGoogle2'); if (c2) c2.style.display = 'block';
      const b = qs('#backupNow'); if (b) b.style.display = 'none';
      const l = qs('#logoutBtn'); if (l) l.style.display = 'none';
      save('Desconectado');
      Toast.success('Logout realizado');
      renderAll();
    } catch (error) {
      Toast.error('Erro ao fazer logout');
    }
  }

  // ===== BACKUP OPERATIONS =====
  async function uploadBackup() {
    if (!state.sync.connected) {
      Toast.warning('Faça login primeiro');
      return;
    }

    const btn = qs('#backupNow');
    const originalText = btn ? btn.textContent : '';
    if (btn) { btn.innerHTML = '<span class="loader"></span>'; btn.disabled = true; }

    try {
      const result = await apiCall('/drive/upload', 'POST', { data: state, fileName: DEFAULT_BACKUP_NAME });

      if (result && result.fileId) state.sync.driveFileId = result.fileId;
      state.sync.lastBackup = new Date().toLocaleString('pt-BR');
      save('Backup sincronizado');
      Toast.success(result && result.message ? result.message : 'Backup sincronizado');
      renderAll();
    } catch (error) {
      Toast.error('Erro ao fazer backup');
    } finally {
      if (btn) { btn.innerHTML = originalText; btn.disabled = false; }
    }
  }

  async function restoreBackup() {
    if (!state.sync.connected) {
      Toast.warning('Faça login primeiro');
      return;
    }

    if (!state.sync.driveFileId) {
      Toast.warning('Nenhum backup encontrado');
      return;
    }

    if (!confirm('Restaurar backup? Os dados locais serão substituídos.')) return;

    try {
      const response = await fetch(`/api/drive/download?fileId=${encodeURIComponent(state.sync.driveFileId)}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Erro ao baixar backup');

      const contentType = response.headers.get('content-type') || '';
      let data;
      if (contentType.includes('application/json')) data = await response.json();
      else data = JSON.parse(await response.text());

      state = normalizeState(data);
      save('Backup restaurado');
      Toast.success('Backup restaurado com sucesso');
      renderAll();
    } catch (error) {
      console.error('Erro ao restaurar backup:', error && (error.stack || error));
      Toast.error('Erro ao restaurar backup');
    }
  }

  // ===== VALIDATION =====
  async function validateTransaction(data) {
    try {
      const result = await apiCall('/validate/transaction', 'POST', data);
      return result;
    } catch (error) {
      return { valid: false, errors: [error.message || 'Erro de validação'] };
    }
  }

  // ===== RENDER FUNCTIONS =====
  function financials(transactions = state.transactions) {
    const income = transactions.filter(t => t.type === 'income').reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const expense = transactions.filter(t => t.type === 'expense').reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    return { income, expense, balance: income - expense };
  }

  function monthTransactions() {
    const key = currentMonthKey();
    const monthItems = state.transactions.filter(item => String(item.date || '').slice(0, 7) === key);
    return monthItems.length ? monthItems : state.transactions;
  }

  function renderTop() {
    const total = financials();
    const month = financials(monthTransactions());

    const oldSaldo = parseFloat(qs('#saldoAtual')?.textContent?.replace(/[^
