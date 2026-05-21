(() => {
  'use strict';

  function exportToCSV() {
    const headers = ['Data', 'Tipo', 'Descrição', 'Categoria', 'Tipo de Gasto', 'Valor'];
    
    const rows = [...state.transactions]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .map(t => [
        t.date,
        t.type === 'income' ? 'Receita' : 'Despesa',
        t.description,
        t.category,
        t.expenseKind,
        t.amount
      ]);

    const total = financials();
    const summaryRows = [
      [],
      ['RESUMO GERAL'],
      ['Total de Receitas', total.income],
      ['Total de Despesas', total.expense],
      ['Saldo Final', total.balance],
      [],
      ['Data de Exportação', new Date().toLocaleString('pt-BR')]
    ];

    const allRows = [
      headers,
      ...rows,
      ...summaryRows
    ];

    const csv = allRows
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    downloadFile(csv, `financeiro-${todayIso()}.csv`, 'text/csv');
    Toast.success('📥 Exportado em CSV');
  }

  async function exportToPDF() {
    try {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js');

      const element = document.createElement('div');
      element.style.padding = '20px';
      element.style.fontFamily = 'Arial, sans-serif';
      element.innerHTML = generatePDFContent();

      const opt = {
        margin: 10,
        filename: `financeiro-${todayIso()}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' }
      };

      html2pdf().set(opt).from(element).save();
      Toast.success('📄 Exportado em PDF');
    } catch (error) {
      Toast.error('Erro ao gerar PDF');
      console.error(error);
    }
  }

  function generatePDFContent() {
    const total = financials();
    const month = financials(monthTransactions());

    let html = `
      <h1 style="text-align:center;color:#01696f">Relatório Financeiro</h1>
      <p style="text-align:center;color:#666">${new Date().toLocaleDateString('pt-BR')}</p>

      <h2>Resumo do Mês</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
        <tr style="background:#f0f0f0">
          <td style="padding:10px;border:1px solid #ddd"><strong>Métrica</strong></td>
          <td style="padding:10px;border:1px solid #ddd;text-align:right"><strong>Valor</strong></td>
        </tr>
        <tr>
          <td style="padding:10px;border:1px solid #ddd">Saldo Atual</td>
          <td style="padding:10px;border:1px solid #ddd;text-align:right;color:#437a22"><strong>${money(total.balance)}</strong></td>
        </tr>
        <tr style="background:#f9f9f9">
          <td style="padding:10px;border:1px solid #ddd">Receitas do Mês</td>
          <td style="padding:10px;border:1px solid #ddd;text-align:right;color:#437a22">${money(month.income)}</td>
        </tr>
        <tr>
          <td style="padding:10px;border:1px solid #ddd">Despesas do Mês</td>
          <td style="padding:10px;border:1px solid #ddd;text-align:right;color:#a13544">${money(month.expense)}</td>
        </tr>
      </table>

      <h2>Distribuição por Categoria</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
        <tr style="background:#f0f0f0">
          <td style="padding:10px;border:1px solid #ddd"><strong>Categoria</strong></td>
          <td style="padding:10px;border:1px solid #ddd;text-align:right"><strong>Valor</strong></td>
          <td style="padding:10px;border:1px solid #ddd;text-align:right"><strong>%</strong></td>
        </tr>
        ${generateCategoryRows(month.expense)}
      </table>

      <h2>Últimas Transações</h2>
      <table style="width:100%;border-collapse:collapse">
        <tr style="background:#f0f0f0">
          <td style="padding:10px;border:1px solid #ddd"><strong>Data</strong></td>
          <td style="padding:10px;border:1px solid #ddd"><strong>Descrição</strong></td>
          <td style="padding:10px;border:1px solid #ddd"><strong>Categoria</strong></td>
          <td style="padding:10px;border:1px solid #ddd;text-align:right"><strong>Valor</strong></td>
        </tr>
        ${state.transactions
          .slice(-10)
          .reverse()
          .map(t => `
            <tr style="${t.type === 'expense' ? 'background:#fff5f5' : 'background:#f5fff5'}">
              <td style="padding:10px;border:1px solid #ddd">${t.date}</td>
              <td style="padding:10px;border:1px solid #ddd">${t.description}</td>
              <td style="padding:10px;border:1px solid #ddd">${t.category}</td>
              <td style="padding:10px;border:1px solid #ddd;text-align:right;color:${t.type === 'income' ? '#437a22' : '#a13544'}">${money(t.amount)}</td>
            </tr>
          `)
          .join('')}
      </table>

      <p style="margin-top:30px;padding-top:20px;border-top:1px solid #ddd;font-size:12px;color:#999">
        Gerado automaticamente pelo Assistente Financeiro V3
      </p>
    `;

    return html;
  }

  function generateCategoryRows(totalExpense) {
    const categories = {};
    state.transactions
      .filter(t => t.type === 'expense' && t.date.startsWith(currentMonthKey()))
      .forEach(t => {
        categories[t.category] = (categories[t.category] || 0) + t.amount;
      });

    return Object.entries(categories)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, amount]) => `
        <tr>
          <td style="padding:10px;border:1px solid #ddd">${cat}</td>
          <td style="padding:10px;border:1px solid #ddd;text-align:right">${money(amount)}</td>
          <td style="padding:10px;border:1px solid #ddd;text-align:right">${((amount / totalExpense) * 100).toFixed(1)}%</td>
        </tr>
      `)
      .join('');
  }

  function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  window.exportToCSV = exportToCSV;
  window.exportToPDF = exportToPDF;
})();