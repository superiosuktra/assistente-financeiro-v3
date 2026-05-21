(() => {
  'use strict';

  const STORAGE_KEY = 'financeiro-v3-data';
  const API_BASE = '/api';
  const DEFAULT_BACKUP_NAME = 'assistente-financeiro-backup.json';

  // ===== UTILITÁRIOS =====
  const qs = (selector, root = document) => root.querySelector(selector);
  const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const on = (selector, event, handler) => {
    const element = qs(selector);
    if (element) element.addEventListener(event, handler);
  };

  const uid = () => (crypto && crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const todayIso = () => new Date().toISOString().slice(0, 10);
  const currentMonthKey = () => todayIso().slice(0, 7);
  const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));

  // ===== TOAST NOTIFICATIONS =====
  const Toast = {
    show(message, type = 'info', duration = 4000) {
      const container = qs('#toastContainer');
      const toast = document.createElement('div');
      toast.className = `toast ${type}`;
      toast.textContent = message;
      container.appendChild(toast);
      
      setTimeout(() => {
        toast.style.animation = 'slideIn .3s ease-out reverse';
        setTimeout(() => toast.remove(), 300);
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
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!saved || typeof saved !== 'object') return base;
      return normalizeState({ ...base, ...saved });
    } catch (error) {
      console.warn('Erro ao carregar dados:', error);
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
      console.error(error);
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
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `HTTP ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      Toast.error(error.message);
      throw error;
    }
  }

  async function checkAuthStatus() {
    try {
      const result = await apiCall('/auth/status');
      if (result.authenticated) {
        state.sync.connected = true;
        state.sync.email = result.user.email;
        qs('#connectGoogle').style.display = 'none';
        qs('#connectGoogle2').style.display = 'none';
        qs('#backupNow').style.display = 'block';
        qs('#logoutBtn').style.display = 'block';
        save();
      }
    } catch (error) {
      // Silencioso - usuário não autenticado
    }
  }

  async function startGoogleAuth() {
    try {
      const result = await apiCall('/auth/google');
      window.location.href = result.authUrl;
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
      qs('#connectGoogle').style.display = 'block';
      qs('#connectGoogle2').style.display = 'block';
      qs('#backupNow').style.display = 'none';
      qs('#logoutBtn').style.display = 'none';
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
    const originalText = btn.textContent;
    btn.innerHTML = '<span class="loader"></span>';
    btn.disabled = true;

    try {
      const result = await apiCall('/drive/upload', 'POST', {
        data: state,
        fileName: DEFAULT_BACKUP_NAME
      });

      state.sync.driveFileId = result.fileId;
      state.sync.lastBackup = new Date().toLocaleString('pt-BR');
      save('Backup sincronizado');
      Toast.success(result.message);
      renderAll();
    } catch (error) {
      Toast.error('Erro ao fazer backup');
    } finally {
      btn.innerHTML = originalText;
      btn.disabled = false;
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
      const response = await fetch(`/api/drive/download?fileId=${state.sync.driveFileId}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Erro ao baixar backup');

      const data = await response.json();
      state = normalizeState(data);
      save('Backup restaurado');
      Toast.success('Backup restaurado com sucesso');
      renderAll();
    } catch (error) {
      Toast.error('Erro ao restaurar backup');
    }
  }

  // ===== VALIDATION =====
  async function validateTransaction(data) {
    try {
      const result = await apiCall('/validate/transaction', 'POST', data);
      return result;
    } catch (error) {
      return { valid: false, errors: [error.message] };
    }
  }

  // ===== RENDER FUNCTIONS =====
  function financials(transactions = state.transactions) {
    const income = transactions.filter(t => t.type === 'income').reduce((sum, item) => sum + item.amount, 0);
    const expense = transactions.filter(t => t.type === 'expense').reduce((sum, item) => sum + item.amount, 0);
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
    
    const oldSaldo = parseFloat(qs('#saldoAtual')?.textContent?.replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;
    const oldGasto = parseFloat(qs('#gastoMes')?.textContent?.replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;
    
    if (window.animateValue) {
      if (oldSaldo !== total.balance) {
        animateValue(qs('#saldoAtual'), oldSaldo, total.balance, 600);
      }
      if (oldGasto !== month.expense) {
        animateValue(qs('#gastoMes'), oldGasto, month.expense, 600);
      }
    } else {
      qs('#saldoAtual').textContent = money(total.balance);
      qs('#gastoMes').textContent = money(month.expense);
    }
    
    qs('#contasPendentes').textContent = state.reminders.length;
    qs('#ultimoBackup').textContent = state.sync.lastBackup || 'Não feito';
    qs('#driveStateBadge').textContent = state.sync.connected ? `✓ Conectado${state.sync.email ? ' • ' + state.sync.email : ''}` : '✗ Desconectado';
    
    if (window.checkBadges) window.checkBadges();
  }

  function renderAlerts() {
    const alerts = [...state.reminders].sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
    qs('#alertList').innerHTML = alerts.length ? alerts.map(item => `
      <div class="list-item">
        <div><strong>${escapeHtml(item.title)}</strong><small>Vence em ${new Date(item.dueDate + 'T12:00:00').toLocaleDateString('pt-BR')}</small></div>
        <div class="amount">${money(item.amount)}</div>
      </div>`).join('') : '<div class="list-item"><div><strong>Nenhuma conta pendente</strong><small>Você está em dia!</small></div></div>';
  }

  function renderMiniTable() {
    qs('#miniTable').innerHTML = [...state.transactions].slice(-5).reverse().map(item => `
      <tr>
        <td>${item.type === 'income' ? '📈' : '📉'}</td>
        <td>${escapeHtml(item.description)}</td>
        <td>${escapeHtml(item.category)}</td>
        <td>${money(item.amount)}</td>
      </tr>`).join('');

    qs('#fullTransactions').innerHTML = [...state.transactions].reverse().map(item => `
      <tr class="transaction-row" data-id="${item.id}">
        <td>${escapeHtml(item.description)}</td>
        <td><span class="badge-category">${escapeHtml(item.category)}</span></td>
        <td>${item.type === 'income' ? '📈 Lucro' : '📉 Gasto'}</td>
        <td class="amount">${money(item.amount)}</td>
        <td>
          <button class="small-btn" onclick="window.openEdit('transactions','${escapeHtml(item.id)}')">✏️</button>
          <button class="small-btn" onclick="window.deleteTx('${escapeHtml(item.id)}')">🗑️</button>
        </td>
      </tr>`).join('');
  }

  function renderAdvice() {
    const total = financials();
    const available = Math.max(total.balance, 0);
    const reserve = available * 0.4;
    const invest = available * 0.3;
    const free = available * 0.3;

    qs('#reservaDica').textContent = money(reserve);
    qs('#investirDica').textContent = money(invest);
    qs('#livreDica').textContent = money(free);

    qs('#quickAdvice').innerHTML = [
      ['Reserva de emergência', `Separe ${money(reserve)} para proteção.`],
      ['Investimento ou trabalho', `Use ${money(invest)} para crescimento.`],
      ['Uso livre planejado', `Deixe ${money(free)} para metas e conforto.`]
    ].map(([title, text]) => `<div class="list-item"><div><strong>${title}</strong><small>${text}</small></div></div>`).join('');

    qs('#tipsList').innerHTML = [
      ['Quite primeiro o que vence antes', 'Evita juros e aperto no fim do mês.'],
      ['Crie uma reserva mínima', 'Mesmo pequena, ela reduz imprevistos.'],
      ['Separe valor para investir em trabalho', 'Cursos, equipamentos e ferramentas podem aumentar sua renda.']
    ].map(([title, text]) => `<div class="list-item"><div><strong>${title}</strong><small>${text}</small></div></div>`).join('');

    qs('#featureIdeas').innerHTML = [
      'PIN de segurança para abrir o app',
      'Exportação em PDF e Excel',
      'Meta de quitação de dívidas',
      'Histórico por mês',
      'Notificações de vencimento',
      'Modo compartilhado familiar',
      'Campo de observação por lançamento',
      'Dashboard de investimentos simples'
    ].map(text => `<div class="list-item"><div><strong>${text}</strong><small>Função útil para deixar o app mais completo.</small></div></div>`).join('');
  }

  function renderGoals() {
    qs('#goalList').innerHTML = [
      ['Quitar cartão', 'Priorize dívidas com juros altos e acompanhe a evolução mensal.'],
      ['Reserva de emergência', 'Defina um alvo entre 3 e 6 meses do seu custo mensal.'],
      ['Investimento em trabalho', 'Separe valor para ferramentas que aumentem produtividade ou renda.']
    ].map(([title, text]) => `<div class="goal-item"><div><strong>${title}</strong><small>${text}</small></div><span class="tag info">Meta</span></div>`).join('');
  }

  function renderReports() {
    const total = financials();
    const categories = {};
    state.transactions.filter(item => item.type === 'expense').forEach(item => {
      categories[item.category] = (categories[item.category] || 0) + item.amount;
    });
    const biggest = Object.entries(categories).sort((a, b) => b[1] - a[1])[0];

    qs('#relIncome').textContent = money(total.income);
    qs('#relExpense').textContent = money(total.expense);
    qs('#biggestCategory').textContent = biggest ? biggest[0] : '-';
    qs('#reportSummary').innerHTML = [
      ['Saldo final do mês', money(total.balance)],
      ['Maior gasto por categoria', biggest ? `${escapeHtml(biggest[0])} • ${money(biggest[1])}` : 'Sem dados'],
      ['Quantidade de lançamentos', `${state.transactions.length} registros`],
      ['Situação geral', total.balance > 0 ? '✓ Saldo positivo' : '⚠️ Atenção ao caixa']
    ].map(([title, text]) => `<div class="list-item"><div><strong>${title}</strong><small>${text}</small></div></div>`).join('');
  }

  function renderSyncFlow() {
    qs('#syncFlow').innerHTML = [
      ['1. Entrar com Google', 'Clique no botão de login e autorize o acesso ao Drive.'],
      ['2. Conectar conta Google', 'O usuário autoriza o app com segurança (OAuth 2.0).'],
      ['3. Criar arquivo de backup', 'Os dados são salvos em um arquivo JSON no Google Drive.'],
      ['4. Restaurar quando precisar', 'O app busca o último backup e recarrega os dados.']
    ].map(([title, text]) => `<div class="sync-item"><div><strong>${title}</strong><small>${text}</small></div></div>`).join('');
  }

  function renderCharts() {
    if (!window.Chart) return;

    const css = getComputedStyle(document.documentElement);
    const textColor = css.getPropertyValue('--color-text').trim();
    const mutedColor = css.getPropertyValue('--color-text-muted').trim();
    const dividerColor = css.getPropertyValue('--color-divider').trim();
    const primaryColor = css.getPropertyValue('--color-primary').trim();
    const errorColor = css.getPropertyValue('--color-error').trim();
    const successColor = css.getPropertyValue('--color-success').trim();
    const warningColor = css.getPropertyValue('--color-warning').trim();
    const blueColor = css.getPropertyValue('--color-blue').trim();

    const cashCanvas = qs('#cashChart');
    if (cashCanvas) {
      if (cashChart) cashChart.destroy();
      cashChart = new Chart(cashCanvas, {
        type: 'line',
        data: {
          labels: ['Dez', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai'],
          datasets: [
            { label: 'Entradas', data: [3200, 4100, 4800, 5300, 5600, financials().income], borderColor: primaryColor, tension: 0.35, borderWidth: 3 },
            { label: 'Saídas', data: [2500, 2800, 3300, 2900, 3100, financials().expense], borderColor: errorColor, tension: 0.35, borderWidth: 3 }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { labels: { color: textColor } } },
          scales: {
            x: { ticks: { color: mutedColor }, grid: { color: 'transparent' } },
            y: { ticks: { color: mutedColor }, grid: { color: dividerColor } }
          }
        }
      });
    }

    const categories = {};
    state.transactions.filter(item => item.type === 'expense').forEach(item => {
      categories[item.category] = (categories[item.category] || 0) + item.amount;
    });

    const categoryCanvas = qs('#categoryChart');
    if (categoryCanvas) {
      if (categoryChart) categoryChart.destroy();
      categoryChart = new Chart(categoryCanvas, {
        type: 'doughnut',
        data: {
          labels: Object.keys(categories),
          datasets: [{ data: Object.values(categories), backgroundColor: [primaryColor, errorColor, successColor, blueColor, warningColor] }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { labels: { color: textColor } } }
        }
      });
    }
  }

  function renderAll() {
    renderTop();
    renderAlerts();
    renderMiniTable();
    renderAdvice();
    renderGoals();
    renderReports();
    renderSyncFlow();
    if (window.renderBadges) window.renderBadges();
    if (window.initSearchFilter) window.initSearchFilter();
    setTimeout(renderCharts, 0);
  }

  // ===== MODAL FUNCTIONS =====
  function fieldHtml(field, item) {
    const value = item[field.name] ?? field.defaultValue ?? '';
    if (field.type === 'select') {
      return `<div class="field"><label>${field.label}</label><select name="${field.name}">${field.options.map(option => {
        const optionValue = typeof option === 'string' ? option : option.value;
        const optionLabel = typeof option === 'string' ? option : option.label;
        return `<option value="${escapeHtml(optionValue)}" ${String(optionValue) === String(value) ? 'selected' : ''}>${escapeHtml(optionLabel)}</option>`;
      }).join('')}</select></div>`;
    }
    return `<div class="field"><label>${field.label}</label><input type="${field.type || 'text'}" name="${field.name}" step="${field.step || ''}" value="${escapeHtml(value)}" ${field.required ? 'required' : ''}></div>`;
  }

  window.openEdit = function(collection, id) {
    const items = state[collection];
    const item = Array.isArray(items) ? items.find(entry => entry.id === id) : null;
    if (!item) return;

    const fields = collection === 'transactions' ? [
      { type: 'select', name: 'type', label: 'Tipo', options: [{ value: 'income', label: 'Lucro' }, { value: 'expense', label: 'Gasto' }] },
      { type: 'text', name: 'description', label: 'Descrição', required: true },
      { type: 'text', name: 'category', label: 'Categoria', required: true },
      { type: 'select', name: 'expenseKind', label: 'Tipo de gasto', options: ['-', 'Essencial', 'Trabalho', 'Investimento', 'Lazer', 'Imprevisto'] },
      { type: 'date', name: 'date', label: 'Data', required: true },
      { type: 'number', name: 'amount', label: 'Valor', step: '0.01', required: true }
    ] : [
      { type: 'text', name: 'title', label: 'Título', required: true },
      { type: 'date', name: 'dueDate', label: 'Vencimento', required: true },
      { type: 'number', name: 'amount', label: 'Valor', step: '0.01', required: true }
    ];

    qs('#modalTitle').textContent = collection === 'transactions' ? 'Editar lançamento' : 'Editar lembrete';
    qs('#editForm [name="collection"]').value = collection;
    qs('#editForm [name="id"]').value = id;
    qs('#editFields').innerHTML = `<div class="form-grid">${fields.map(field => fieldHtml(field, item)).join('')}</div>`;
    qs('#editModal').style.display = 'flex';
  };

  function closeEdit() {
    qs('#editModal').style.display = 'none';
    qs('#editFields').innerHTML = '';
    qs('#editForm').reset();
  }

  window.closeEdit = closeEdit;

  window.deleteTx = function(id) {
    if (!confirm('Deseja excluir este lançamento?')) return;
    state.transactions = state.transactions.filter(item => item.id !== id);
    save();
    renderAll();
    Toast.success('Lançamento excluído');
  };

  // ===== EVENT SETUP =====
  function setupEvents() {
    on('#transactionForm', 'submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);

      const transaction = {
        type: data.get('type'),
        description: String(data.get('description') || '').trim(),
        category: String(data.get('category') || '').trim(),
        amount: parseFloat(data.get('amount')) || 0,
        date: data.get('date')
      };

      const validation = await validateTransaction(transaction);
      if (!validation.valid) {
        validation.errors.forEach(err => Toast.error(err));
        return;
      }

      state.transactions.push({
        id: uid(),
        ...transaction,
        expenseKind: data.get('expenseKind') || '-'
      });

      save();
      renderAll();
      form.reset();
      qs('#transactionForm [name="date"]').value = todayIso();
      Toast.success('Lançamento salvo');
    });

    qsa('[data-view-btn]').forEach(button => {
      button.addEventListener('click', () => {
        const view = button.dataset.viewBtn;
        qsa('[data-view-btn]').forEach(item => item.classList.remove('active'));
        button.classList.add('active');
        qsa('.view').forEach(section => section.classList.remove('active'));
        qs('#view-' + view).classList.add('active');
        qs('#sidebar').classList.remove('open');
        setTimeout(renderCharts, 0);
      });
    });

    on('#menuToggle', 'click', () => qs('#sidebar').classList.toggle('open'));
    on('#themeToggle', 'click', () => {
      const root = document.documentElement;
      root.setAttribute('data-theme', root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
      setTimeout(renderCharts, 0);
    });

    on('#connectGoogle', 'click', startGoogleAuth);
    on('#connectGoogle2', 'click', startGoogleAuth);
    on('#logoutBtn', 'click', logout);
    on('#backupNow', 'click', uploadBackup);
    on('#simulateBackup', 'click', uploadBackup);
    on('#restoreBackup', 'click', restoreBackup);

    on('#editModal', 'click', event => {
      if (event.target === qs('#editModal')) closeEdit();
    });
    on('#closeEdit', 'click', closeEdit);

    on('#editForm', 'submit', event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const collection = data.get('collection');
      const id = data.get('id');
      const item = state[collection]?.find(entry => entry.id === id);
      if (!item) return;

      for (const [key, value] of data.entries()) {
        if (key === 'collection' || key === 'id') continue;
        item[key] = key === 'amount' ? Number(value) || 0 : String(value).trim();
      }
      save();
      renderAll();
      closeEdit();
      Toast.success('Alterações salvas');
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && qs('#editModal').style.display === 'flex') {
        closeEdit();
      }
    });
  }

  // ===== INIT =====
  async function init() {
    setupEvents();
    qs('#transactionForm [name="date"]').value = todayIso();
    
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('✅ SW registrado'))
        .catch(err => console.log('⚠️ SW erro:', err));
    }

    if (window.initSearchFilter) {
      window.initSearchFilter();
    }

    if (window.checkBadges) {
      window.checkBadges();
      window.renderBadges();
    }
    
    await checkAuthStatus();
    save();
    renderAll();
    Toast.info('Bem-vindo ao Assistente Financeiro V3 🚀');
  }

  // Export global
  window.state = state;
  window.financials = financials;
  window.monthTransactions = monthTransactions;
  window.currentMonthKey = currentMonthKey;
  window.todayIso = todayIso;
  window.money = money;
  window.escapeHtml = escapeHtml;
  window.qs = qs;
  window.qsa = qsa;
  window.Toast = Toast;
  window.save = save;
  window.renderAll = renderAll;

  init();
})();