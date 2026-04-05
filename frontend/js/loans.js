/**
 * FIN GUIDE – Loans Page JS
 * Loan comparison table with type filtering + EMI calculator
 */

(function () {
    const API = window.FinAPI;
    let currentType = 'all';
    let currentSort = 'rate';

    document.getElementById('hamburger')?.addEventListener('click', () => {
        document.getElementById('navLinks').classList.toggle('mobile-open');
    });

    // Type tabs
    document.querySelectorAll('.type-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.type-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentType = tab.dataset.type;
            loadLoans();
        });
    });

    document.getElementById('loanFilter')?.addEventListener('click', () => {
        currentSort = document.getElementById('loanSort').value;
        loadLoans();
    });

    async function loadLoans() {
        const tbody = document.getElementById('loans-tbody');
        tbody.innerHTML = '<tr><td colspan="7"><div class="loading-overlay"><div class="spinner"></div></div></td></tr>';
        try {
            const params = new URLSearchParams({ sort: currentSort, limit: '30' });
            if (currentType !== 'all') params.set('loanType', currentType);
            const data = await API.get('/api/loans?' + params.toString());
            renderLoans(data.data || []);
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--danger);">Error: ${err.message}</td></tr>`;
        }
    }

    function renderLoans(loans) {
        const tbody = document.getElementById('loans-tbody');
        if (!loans.length) {
            tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><div class="icon">🔍</div><p>No loans found for this filter.</p></div></td></tr>';
            return;
        }
        tbody.innerHTML = loans.map(l => {
            const typeColors = { personal: 'badge-blue', home: 'badge-green', car: 'badge-yellow' };
            return `<tr>
        <td><strong>${l.bankName}</strong></td>
        <td>${l.loanName}</td>
        <td><span class="badge ${typeColors[l.loanType] || 'badge-blue'}">${l.loanType}</span></td>
        <td class="table-rate">${l.interestRate}% p.a.</td>
        <td>${l.processingFee}%</td>
        <td>${l.minTenure}–${l.maxTenure} mo</td>
        <td>
          <div class="table-actions">
            <button class="btn btn-sm btn-secondary" onclick="prefillEMI(${l.interestRate})">Calc EMI</button>
            <a href="${l.applyUrl || '#'}" target="_blank" rel="noopener" class="btn btn-sm btn-primary">Apply ↗</a>
          </div>
        </td>
      </tr>`;
        }).join('');
    }

    // EMI Calculator
    window.prefillEMI = (rate) => {
        document.getElementById('emiRate').value = rate;
        document.getElementById('emiPrincipal').focus();
        window.showToast(`Rate set to ${rate}% — enter amount and tenure!`, 'info');
    };

    document.getElementById('calcEMI')?.addEventListener('click', async () => {
        const p = parseFloat(document.getElementById('emiPrincipal').value);
        const r = parseFloat(document.getElementById('emiRate').value);
        const n = parseInt(document.getElementById('emiTenure').value);

        if (!p || !r || !n || p <= 0 || r <= 0 || n <= 0) {
            window.showToast('Please fill in all three fields correctly.', 'error');
            return;
        }

        try {
            const data = await API.get(`/api/loans/emi?principal=${p}&rate=${r}&tenure=${n}`);
            if (data.success) {
                const { emi, totalPayment, totalInterest } = data.data;
                document.getElementById('emiValue').textContent = window.formatINR(Math.round(emi));
                document.getElementById('emiTotal').textContent = window.formatINR(Math.round(totalPayment));
                document.getElementById('emiInterest').textContent = window.formatINR(Math.round(totalInterest));
                document.getElementById('emiResult').style.display = 'block';
            }
        } catch (err) {
            window.showToast('EMI calculation error: ' + err.message, 'error');
        }
    });

    loadLoans();
})();
