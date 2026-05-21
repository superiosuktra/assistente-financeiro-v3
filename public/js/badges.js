(() => {
  'use strict';

  const BADGES_STORAGE_KEY = 'financeiro-badges';

  const BADGE_DEFINITIONS = {
    firstTransaction: {
      id: 'firstTransaction',
      name: '🚀 Primeiro Voo',
      description: 'Registre seu primeira transação',
      icon: '🚀',
      condition: () => state.transactions.length >= 1
    },
    tenTransactions: {
      id: 'tenTransactions',
      name: '📊 Contador',
      description: 'Registre 10 transações',
      icon: '📊',
      condition: () => state.transactions.length >= 10
    },
    balance1k: {
      id: 'balance1k',
      name: '💰 Mil Reais',
      description: 'Tenha saldo de R$ 1.000+',
      icon: '💰',
      condition: () => financials().balance >= 1000
    },
    balance5k: {
      id: 'balance5k',
      name: '🤑 Rico Demais',
      description: 'Tenha saldo de R$ 5.000+',
      icon: '🤑',
      condition: () => financials().balance >= 5000
    },
    zeroExpense: {
      id: 'zeroExpense',
      name: '🎯 Controle Total',
      description: 'Tenha um dia sem gastos',
      icon: '🎯',
      condition: () => {
        const today = todayIso();
        return !state.transactions.some(t => t.date === today && t.type === 'expense');
      }
    },
    backup: {
      id: 'backup',
      name: '☁️ Seguro na Nuvem',
      description: 'Faça seu primeiro backup',
      icon: '☁️',
      condition: () => state.sync.lastBackup !== null
    },
    budgetMaster: {
      id: 'budgetMaster',
      name: '💪 Domina o Orçamento',
      description: 'Mantenha gastos 30% abaixo da meta',
      icon: '💪',
      condition: () => {
        const month = financials(monthTransactions());
        const target = 1500;
        return month.expense < target * 0.7;
      }
    },
    consistentSpender: {
      id: 'consistentSpender',
      name: '📈 Consistência',
      description: 'Registre transações 5 dias seguidos',
      icon: '📈',
      condition: () => checkConsecutiveDays() >= 5
    },
    allCategories: {
      id: 'allCategories',
      name: '🌈 Diversificado',
      description: 'Use 5+ categorias diferentes',
      icon: '🌈',
      condition: () => {
        const categories = new Set(state.transactions.map(t => t.category));
        return categories.size >= 5;
      }
    },
    maxIncome: {
      id: 'maxIncome',
      name: '💸 Milionário',
      description: 'Acumule R$ 10.000+ em receitas',
      icon: '💸',
      condition: () => financials().income >= 10000
    }
  };

  function checkConsecutiveDays() {
    const dates = [...new Set(state.transactions.map(t => t.date))].sort();
    let maxStreak = 0;
    let currentStreak = 1;

    for (let i = 1; i < dates.length; i++) {
      const date1 = new Date(dates[i - 1]);
      const date2 = new Date(dates[i]);
      const diffDays = (date2 - date1) / (1000 * 60 * 60 * 24);

      if (diffDays === 1) {
        currentStreak++;
      } else {
        maxStreak = Math.max(maxStreak, currentStreak);
        currentStreak = 1;
      }
    }

    return Math.max(maxStreak, currentStreak);
  }

  function loadBadges() {
    try {
      const saved = JSON.parse(localStorage.getItem(BADGES_STORAGE_KEY) || '{}');
      return saved;
    } catch {
      return {};
    }
  }

  function saveBadges(badges) {
    localStorage.setItem(BADGES_STORAGE_KEY, JSON.stringify(badges));
  }

  function checkBadges() {
    const earnedBadges = loadBadges();

    Object.values(BADGE_DEFINITIONS).forEach(badge => {
      const isEarned = earnedBadges[badge.id];
      const conditionMet = badge.condition();

      if (conditionMet && !isEarned) {
        earnedBadges[badge.id] = {
          ...badge,
          unlockedAt: new Date().toISOString()
        };
        showBadgeNotification(badge);
        saveBadges(earnedBadges);
      }
    });

    return earnedBadges;
  }

  function showBadgeNotification(badge) {
    const notification = document.createElement('div');
    notification.className = 'badge-notification';
    notification.innerHTML = `
      <div class="badge-popup">
        <div class="badge-icon">${badge.icon}</div>
        <div class="badge-text">
          <strong>Desbloqueado!</strong>
          <p>${badge.name}</p>
          <small>${badge.description}</small>
        </div>
      </div>
    `;

    document.body.appendChild(notification);
    Toast.success(`🏅 Desbloqueado: ${badge.name}`);

    setTimeout(() => {
      notification.classList.add('fadeOut');
      setTimeout(() => notification.remove(), 500);
    }, 4000);
  }

  function renderBadges() {
    const container = qs('#badgesContainer');
    if (!container) return;

    const earnedBadges = loadBadges();

    const badgesHtml = Object.values(BADGE_DEFINITIONS).map(badge => {
      const isEarned = earnedBadges[badge.id];
      return `
        <div class="badge ${isEarned ? 'earned' : 'locked'}">
          <div class="badge-icon">${badge.icon}</div>
          <div class="badge-info">
            <strong>${badge.name}</strong>
            <small>${badge.description}</small>
            ${isEarned ? `<span class="earned-date">Desbloqueado em ${new Date(isEarned.unlockedAt).toLocaleDateString('pt-BR')}</span>` : ''}
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div class="badges-grid">
        ${badgesHtml}
      </div>
      <div class="badges-stats">
        <p>${Object.keys(earnedBadges).length} de ${Object.keys(BADGE_DEFINITIONS).length} desbloqueados</p>
      </div>
    `;
  }

  window.checkBadges = checkBadges;
  window.renderBadges = renderBadges;
})();