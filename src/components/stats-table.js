/**
 * Renders a sortable stats table.
 * @param {HTMLElement} container
 * @param {object[]} rows - Array of row data
 * @param {object[]} columns - [{key, label, sortable?}]
 * @param {string} defaultSort - default sort key
 */
export function renderStatsTable(container, rows, columns, defaultSort) {
  let sortKey = defaultSort || columns[0]?.key;
  let sortDir = 'desc';

  function render() {
    const sorted = [...rows].sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === 'asc' ? av - bv : bv - av;
    });

    container.innerHTML = `
      <div class="table-wrapper">
        <table class="stats-table">
          <thead>
            <tr>
              <th>#</th>
              ${columns.map(col => `
                <th class="${col.sortable !== false ? 'sortable' : ''} ${sortKey === col.key ? 'active' : ''}"
                    data-key="${col.key}">
                  ${col.label} ${sortKey === col.key ? (sortDir === 'asc' ? '&#9650;' : '&#9660;') : ''}
                </th>
              `).join('')}
            </tr>
          </thead>
          <tbody>
            ${sorted.map((row, i) => `
              <tr>
                <td>${i + 1}</td>
                ${columns.map(col => `<td>${row[col.key] ?? 0}</td>`).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;

    container.querySelectorAll('th.sortable').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.dataset.key;
        if (sortKey === key) {
          sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          sortKey = key;
          sortDir = 'desc';
        }
        render();
      });
    });
  }

  render();
}
