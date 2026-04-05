/**
 * FIN GUIDE – Credit Cards Page JS
 * Handles filtering, card rendering, compare selection, and modal.
 */

(function () {
    const API = window.FinAPI;
    let allCards = [];
    let compareList = [];

    // DOM refs
    const grid = document.getElementById('cards-grid');
    const noResults = document.getElementById('no-results');
    const totalCount = document.getElementById('total-count');
    const compareBar = document.getElementById('compareBar');
    const compareItems = document.getElementById('compareItems');
    const compareModal = document.getElementById('compareModal');
    const compareContent = document.getElementById('compareContent');

    // Hamburger
    document.getElementById('hamburger')?.addEventListener('click', () => {
        document.getElementById('navLinks').classList.toggle('mobile-open');
    });

    async function loadCards() {
        try {
            const params = buildFilterParams();
            const data = await API.get('/api/credit-cards?' + params);
            allCards = data.data || [];
            if (totalCount) totalCount.textContent = allCards.length;
            renderCards(allCards);
        } catch (err) {
            grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><div class="icon">⚠️</div><h3>Unable to load cards</h3><p>${err.message}</p></div>`;
        }
    }

    function buildFilterParams() {
        const params = new URLSearchParams();
        const rewards = document.getElementById('filterRewards').value;
        const cashback = document.getElementById('filterCashback').value;
        const maxFee = document.getElementById('filterMaxFee').value;
        const sort = document.getElementById('filterSort').value;
        if (rewards !== 'all') params.set('rewardsType', rewards);
        if (cashback) params.set('minCashback', cashback);
        if (maxFee) params.set('maxFee', maxFee);
        params.set('sort', sort);
        params.set('limit', '30');
        return params.toString();
    }

    function renderCards(cards) {
        if (!cards.length) {
            grid.innerHTML = '';
            noResults.style.display = 'block';
            return;
        }
        noResults.style.display = 'none';
        grid.innerHTML = cards.map((c) => cardHTML(c)).join('');
        // Attach compare checkboxes
        grid.querySelectorAll('.cmp-check').forEach(cb => {
            cb.addEventListener('change', (e) => handleCompareToggle(e.target, cards));
        });
    }

    function cardHTML(c) {
        const rbClass = `rb-${c.rewardsType}`;
        const isInCompare = compareList.find(x => x._id === c._id);
        const features = (c.features || []).slice(0, 3);
        return `<div class="card product-card" data-id="${c._id}">
      <div class="compare-checkbox">
        <input type="checkbox" class="cmp-check" value="${c._id}" ${isInCompare ? 'checked' : ''} title="Add to compare">
      </div>
      <div class="card-header">
        <div class="bank-logo" style="background:${bankColor(c.bankName)}">${c.bankName.charAt(0)}</div>
        <div class="card-info">
          <h3>${c.cardName}</h3>
          <p>${c.bankName}</p>
          <div class="rating">⭐ ${c.rating}/5</div>
        </div>
      </div>
      <div class="card-stats">
        <div class="stat-item">
          <div class="stat-label">Annual Fee</div>
          <div class="stat-value">${c.annualFee === 0 ? '<span style="color:var(--success);font-weight:700;">FREE</span>' : '₹' + c.annualFee.toLocaleString('en-IN')}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Cashback</div>
          <div class="stat-value highlight">${c.cashback || 0}%</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Interest Rate</div>
          <div class="stat-value">${c.interestRate}% p.a.</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Rewards</div>
          <div class="stat-value"><span class="reward-badge ${rbClass}">${c.rewardsType}</span></div>
        </div>
      </div>
      ${features.length ? `<div class="card-features">${features.map(f => `<span class="feature-tag">✓ ${f}</span>`).join('')}</div>` : ''}
      <div class="card-actions">
        <a href="${c.applyUrl || '#'}" target="_blank" rel="noopener" class="btn btn-primary btn-sm">Apply Now ↗</a>
      </div>
    </div>`;
    }

    function bankColor(name) {
        const colors = { 'HDFC': 'linear-gradient(135deg,#004c8f,#0071eb)', 'SBI': 'linear-gradient(135deg,#003087,#2a73c5)', 'ICICI': 'linear-gradient(135deg,#b71c1c,#ef5350)', 'Axis': 'linear-gradient(135deg,#8b0000,#c62828)', 'Kotak': 'linear-gradient(135deg,#e65100,#ff6d00)', 'YES': 'linear-gradient(135deg,#1565c0,#42a5f5)' };
        for (const [k, v] of Object.entries(colors)) { if (name.includes(k)) return v; }
        return 'linear-gradient(135deg,var(--primary),var(--secondary))';
    }

    function handleCompareToggle(checkbox, cards) {
        const id = checkbox.value;
        const card = cards.find(c => c._id === id) || allCards.find(c => c._id === id);
        if (!card) return;

        if (checkbox.checked) {
            if (compareList.length >= 3) {
                checkbox.checked = false;
                window.showToast('You can compare up to 3 cards at a time.', 'error');
                return;
            }
            compareList.push(card);
        } else {
            compareList = compareList.filter(c => c._id !== id);
        }
        updateCompareBar();
    }

    function updateCompareBar() {
        if (compareList.length === 0) {
            compareBar.classList.remove('visible');
            return;
        }
        compareBar.classList.add('visible');
        compareItems.innerHTML = compareList.map(c =>
            `<div class="compare-bar-item">
        ${c.bankName} ${c.cardName}
        <button class="remove" data-id="${c._id}" title="Remove">✕</button>
      </div>`).join('');
        compareItems.querySelectorAll('.remove').forEach(btn => {
            btn.addEventListener('click', () => {
                compareList = compareList.filter(c => c._id !== btn.dataset.id);
                // Uncheck in grid
                const cb = grid.querySelector(`.cmp-check[value="${btn.dataset.id}"]`);
                if (cb) cb.checked = false;
                updateCompareBar();
            });
        });
    }

    function openCompareModal() {
        if (compareList.length < 2) {
            window.showToast('Please select at least 2 cards to compare.', 'info');
            return;
        }
        const rows = [
            { label: 'Bank', key: c => c.bankName },
            { label: 'Annual Fee', key: c => c.annualFee === 0 ? 'FREE' : '₹' + c.annualFee.toLocaleString('en-IN'), lower: true },
            { label: 'Joining Fee', key: c => c.joiningFee === 0 ? 'FREE' : '₹' + (c.joiningFee || 0).toLocaleString('en-IN'), lower: true },
            { label: 'Cashback %', key: c => c.cashback + '%', higher: true },
            { label: 'Interest Rate', key: c => c.interestRate + '% p.a.', lower: true },
            { label: 'Rewards Type', key: c => c.rewardsType },
            { label: 'Min Income', key: c => c.minIncome ? '₹' + c.minIncome.toLocaleString('en-IN') + '/mo' : '—', lower: true },
            { label: 'Rating', key: c => '⭐ ' + c.rating + '/5', higher: true },
            { label: 'Eligibility', key: c => c.eligibility || '—' },
            { label: 'Apply', key: c => `<a href="${c.applyUrl || '#'}" target="_blank" class="btn btn-primary btn-sm">Apply ↗</a>` }
        ];

        const cols = compareList.length;
        const colsTemplate = `160px ${Array(cols).fill('1fr').join(' ')}`;

        const headerRow = `<div class="compare-grid" style="grid-template-columns:${colsTemplate};margin-bottom:1px;">
      <div style="background:var(--bg-primary);"></div>
      ${compareList.map(c => `<div class="col-header"><strong>${c.bankName}</strong><br/><small>${c.cardName}</small></div>`).join('')}
    </div>`;

        const dataRows = rows.map(row => {
            const values = compareList.map(c => row.key(c));
            let winnerIdx = -1;
            if (row.higher) {
                const nums = values.map(v => parseFloat(v));
                winnerIdx = nums.indexOf(Math.max(...nums.filter(n => !isNaN(n))));
            } else if (row.lower) {
                const nums = values.map(v => parseFloat(v.replace(/[₹,%]/g, '').replace('FREE', '0')));
                winnerIdx = nums.indexOf(Math.min(...nums.filter(n => !isNaN(n))));
            }
            return `<div class="compare-grid" style="grid-template-columns:${colsTemplate};">
        <div class="row-label">${row.label}</div>
        ${values.map((v, i) => `<div class="row-value ${i === winnerIdx ? 'compare-winner' : ''}">${v}</div>`).join('')}
      </div>`;
        }).join('');

        compareContent.innerHTML = headerRow + dataRows;
        compareModal.classList.add('active');
    }

    document.getElementById('compareBtn')?.addEventListener('click', openCompareModal);
    document.getElementById('clearCompare')?.addEventListener('click', () => {
        compareList = [];
        grid.querySelectorAll('.cmp-check').forEach(cb => cb.checked = false);
        updateCompareBar();
    });
    document.getElementById('closeModal')?.addEventListener('click', () => compareModal.classList.remove('active'));
    compareModal?.addEventListener('click', e => { if (e.target === compareModal) compareModal.classList.remove('active'); });

    document.getElementById('applyFilters')?.addEventListener('click', loadCards);
    document.getElementById('resetFilters')?.addEventListener('click', () => {
        ['filterRewards', 'filterSort'].forEach(id => document.getElementById(id) && (document.getElementById(id).value = document.getElementById(id).options[0].value));
        ['filterCashback', 'filterMaxFee'].forEach(id => document.getElementById(id) && (document.getElementById(id).value = ''));
        loadCards();
    });

    loadCards();
})();
