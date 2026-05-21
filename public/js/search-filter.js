(() => {
  'use strict';

  function initSearchFilter() {
    const searchInput = qs('#searchTransactions');
    const filterCategory = qs('#filterCategory');
    const filterType = qs('#filterType');
    const clearFiltersBtn = qs('#clearFilters');

    if (!searchInput) return;

    function updateCategories() {
      const categories = [...new Set(state.transactions.map(t => t.category))];
      if (filterCategory) {
        filterCategory.innerHTML = '<option value="">Todas as categorias</option>' +
          categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
      }
    }

    function applyFilters() {
      const query = searchInput.value.toLowerCase().trim();
      const selectedCategory = filterCategory?.value || '';
      const selectedType = filterType?.value || '';

      let filtered = [...state.transactions];

      if (query) {
        filtered = filtered.filter(t =>
          t.description.toLowerCase().includes(query) ||
          t.category.toLowerCase().includes(query)
        );
      }

      if (selectedCategory) {
        filtered = filtered.filter(t => t.category === selectedCategory);
      }

      if (selectedType) {
        filtered = filtered.filter(t => t.type === selectedType);
      }

      renderFilteredTable(filtered);
      updateFilterStats(filtered);
    }

    function renderFilteredTable(transactions) {
      const tbody = qs('#fullTransactions');
      if (!tbody) return;

      if (transactions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--color-text-muted);">Nenhuma transação encontrada</td></tr>';
        return;
      }

      tbody.innerHTML = transactions.reverse().map(item => `
        <tr class="transaction-row" data-id="${item.id}">
          <td>${escapeHtml(item.description)}</td>
          <td><span class="badge-category">${escapeHtml(item.category)}</span></td>
          <td>${item.type === 'income' ? '📈 Lucro' : '📉 Gasto'}</td>
          <td class="amount">${money(item.amount)}</td>
          <td>
            <button class="small-btn" onclick="window.openEdit('transactions','${escapeHtml(item.id)}')">✏️</button>
            <button class="small-btn" onclick="window.deleteTx('${escapeHtml(item.id)}')">🗑️</button>
          </td>
        </tr>
      `).join('');
    }

    function updateFilterStats(transactions) {
      const statsDiv = qs('#filterStats');
      if (!statsDiv) return;

      const income = transactions.filter(t => t.type === 'income')
        .reduce((sum, t) => sum + t.amount, 0);
      const expense = transactions.filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);

      statsDiv.innerHTML = `
        <div class="stats-row">
          <div class="stat-item">
            <span>Total de Resultados</span>
            <strong>${transactions.length}</strong>
          </div>
          <div class="stat-item success">
            <span>Entradas</span>
            <strong>${money(income)}</strong>
          </div>
          <div class="stat-item error">
            <span>Saídas</span>
            <strong>${money(expense)}</strong>
          </div>
          <div class="stat-item">
            <span>Saldo</span>
            <strong>${money(income - expense)}</strong>
          </div>
        </div>
      `;
    }

    if (searchInput) {
      searchInput.addEventListener('input', applyFilters);
    }
    if (filterCategory) {
      filterCategory.addEventListener('change', applyFilters);
    }
    if (filterType) {
      filterType.addEventListener('change', applyFilters);
    }
    if (clearFiltersBtn) {
      clearFiltersBtn.addEventListener('click', () => {
        searchInput.value = '';
        if (filterCategory) filterCategory.value = '';
        if (filterType) filterType.value = '';
        applyFilters();
        Toast.info('Filtros limpos');
      });
    }

    updateCategories();
  }

  window.initSearchFilter = initSearchFilter;
})();