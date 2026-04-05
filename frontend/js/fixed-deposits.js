/**
 * FIN GUIDE – Fixed Deposits Page JS
 * FD comparison table with filters + maturity calculator
 */

(function () {
    const API = window.FinAPI;

    document.getElementById('hamburger')?.addEventListener('click', () => {
        document.getElementById('navLinks').classList.toggle('mobile-open');
    });

    function buildFDParams() {
        const params = new URLSearchParams();
        const minRate = document.getElementById('fdMinRate').value;
        const tenure = document.getElementById('fdTenure').value;
        const bankType = document.getElementById('fdBankType').value;
        const sort = document.getElementById('fdSort').value;
        if (minRate) params.set('minRate', minRate);
        if (bankType !== 'all') params.set('bankType', bankType);
        params.set('sort', sort);
        params.set('limit', '30');
        // Tenure filter
        if (tenure === 'short') { params.set('maxTenure', '364'); }
        else if (tenure === 'medium') { params.set('minTenure', '365'); params.set('maxTenure', '1094'); }
        else if (tenure === 'long') { params.set('minTenure', '1095'); }
        return params.toString();
    }

    async function loadFDs() {
        const tbody = document.getElementById('fd-tbody');
        tbody.innerHTML = '<tr><td colspan="8"><div class="loading-overlay"><div class="spinner"></div></div></td></tr>';
        try {
            const data = await API.get('/api/fds?' + buildFDParams());
            const fds = data.data || [];
            const total = document.getElementById('fd-total');
            if (total) total.textContent = fds.length;
            renderFDs(fds);
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--danger);">Error: ${err.message}</td></tr>`;
        }
    }

    function bankTypeLabel(type) {
        const map = { public: 'Public', private: 'Private', small_finance: 'Small Finance', nbfc: 'NBFC' };
        return map[type] || type;
    }

    function bankTypeBadge(type) {
        const map = { public: 'badge-green', private: 'badge-blue', small_finance: 'badge-yellow', nbfc: 'badge-yellow' };
        return map[type] || 'badge-blue';
    }

    function formatTenure(days) {
        if (days < 30) return days + ' days';
        if (days < 365) return Math.round(days / 30) + ' months';
        return Math.round(days / 365 * 10) / 10 + ' years';
    }

    function renderFDs(fds) {
        const tbody = document.getElementById('fd-tbody');
        if (!fds.length) {
            tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state"><div class="icon">🔍</div><p>No FDs found. Try adjusting filters.</p></div></td></tr>';
            return;
        }
        tbody.innerHTML = fds.map(f => `
      <tr>
        <td><strong>${f.bankName}</strong></td>
        <td>${f.schemeName || 'Fixed Deposit'}</td>
        <td><span class="badge ${bankTypeBadge(f.bankType)}">${bankTypeLabel(f.bankType)}</span></td>
        <td class="table-rate">${f.interestRate}%</td>
        <td style="color:var(--success);font-weight:600;">${f.seniorCitizenRate}%</td>
        <td>${formatTenure(f.minTenure)}</td>
        <td>${formatTenure(f.maxTenure)}</td>
        <td>
          <div class="table-actions">
            <button class="btn btn-sm btn-secondary" onclick="prefillFD(${f.interestRate})">Calc</button>
            <a href="${f.applyUrl || '#'}" target="_blank" rel="noopener" class="btn btn-sm btn-primary">Apply ↗</a>
          </div>
        </td>
      </tr>`).join('');
    }

    // Prefill calculator from table
    window.prefillFD = (rate) => {
        document.getElementById('fdRate').value = rate;
        document.getElementById('fdPrincipal').focus();
        window.showToast(`Rate set to ${rate}% — enter amount and tenure!`, 'info');
    };

    // FD Calculator
    document.getElementById('calcFD')?.addEventListener('click', async () => {
        const principal = parseFloat(document.getElementById('fdPrincipal').value);
        const rate = parseFloat(document.getElementById('fdRate').value);
        const tenure = parseInt(document.getElementById('fdDuration').value);
        const frequency = document.getElementById('fdFrequency').value;
        const isSenior = document.getElementById('fdSenior').checked;

        if (!principal || !rate || !tenure || principal <= 0 || rate <= 0 || tenure <= 0) {
            window.showToast('Please fill in all fields correctly.', 'error');
            return;
        }

        try {
            const params = new URLSearchParams({ principal, rate, tenure, frequency, isSenior: isSenior.toString() });
            const data = await API.get('/api/fds/maturity?' + params.toString());
            if (data.success) {
                const { maturityAmount, interestEarned, effectiveRate, tenureYears } = data.data;
                document.getElementById('fdMaturity').textContent = window.formatINR(Math.round(maturityAmount));
                document.getElementById('fdPrincipalResult').textContent = window.formatINR(principal);
                document.getElementById('fdInterestEarned').textContent = window.formatINR(Math.round(interestEarned));
                document.getElementById('fdEffectiveRate').textContent = effectiveRate + '% p.a.';
                document.getElementById('fdTenureYears').textContent = tenureYears + ' years';
                document.getElementById('fdResult').style.display = 'block';
            }
        } catch (err) {
            window.showToast('Calculation error: ' + err.message, 'error');
        }
    });

    document.getElementById('applyFdFilter')?.addEventListener('click', loadFDs);
    document.getElementById('resetFdFilter')?.addEventListener('click', () => {
        ['fdMinRate', 'fdDuration'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        ['fdTenure', 'fdBankType', 'fdSort'].forEach(id => { const el = document.getElementById(id); if (el) el.selectedIndex = 0; });
        loadFDs();
    });

    loadFDs();
})();
