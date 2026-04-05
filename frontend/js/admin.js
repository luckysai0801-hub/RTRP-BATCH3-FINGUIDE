/**
 * FIN GUIDE – Admin Dashboard JS
 * Full CRUD for Credit Cards, Loans, FDs + dashboard stats + rate update
 */

(function () {
    const API = window.FinAPI;

    // Auth guard
    const token = localStorage.getItem('fg_token');
    if (!token) { window.location.href = '/admin-login.html'; return; }

    const adminInfo = JSON.parse(localStorage.getItem('fg_admin') || '{}');
    document.getElementById('adminEmail').textContent = '👤 ' + (adminInfo.email || 'Admin');

    // Hamburger (mobile)
    // Sidebar navigation
    let currentSection = 'overview';
    function showSection(name) {
        document.querySelectorAll('[id^="section-"]').forEach(s => s.style.display = 'none');
        document.getElementById('section-' + name).style.display = 'block';
        document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
        document.querySelector(`.sidebar-nav a[data-section="${name}"]`)?.classList.add('active');
        document.getElementById('pageTitle').textContent = {
            overview: 'Dashboard Overview', 'credit-cards': 'Credit Cards Management',
            loans: 'Loans Management', 'fixed-deposits': 'Fixed Deposits Management'
        }[name] || name;
        currentSection = name;
        if (name === 'credit-cards') loadAdminCards();
        else if (name === 'loans') loadAdminLoans();
        else if (name === 'fixed-deposits') loadAdminFDs();
    }

    document.querySelectorAll('.sidebar-nav a[data-section]').forEach(a => {
        a.addEventListener('click', e => { e.preventDefault(); showSection(a.dataset.section); });
    });

    // Logout
    document.getElementById('logoutBtn').addEventListener('click', (e) => {
        e.preventDefault();
        localStorage.removeItem('fg_token');
        localStorage.removeItem('fg_admin');
        window.location.href = '/admin-login.html';
    });

    // Dashboard stats
    async function loadDashboard() {
        try {
            const data = await API.get('/api/admin/dashboard');
            if (!data.success) return;
            const { totalCards, totalLoans, totalFDs, lastUpdated } = data.data;
            document.getElementById('dashStats').innerHTML = `
        <div class="stat-card"><div class="s-icon">💳</div><div class="s-value">${totalCards}</div><div class="s-label">Active Credit Cards</div></div>
        <div class="stat-card" style="border-left-color:var(--success)"><div class="s-icon">🏛️</div><div class="s-value">${totalLoans}</div><div class="s-label">Active Loans</div></div>
        <div class="stat-card" style="border-left-color:var(--warning)"><div class="s-icon">🏦</div><div class="s-value">${totalFDs}</div><div class="s-label">Active FD Schemes</div></div>
      `;
            document.getElementById('lastUpdatedInfo').innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;">
          <div><strong>💳 Credit Cards</strong><br/><span>${window.formatDate(lastUpdated?.creditCards)}</span></div>
          <div><strong>🏛️ Loans</strong><br/><span>${window.formatDate(lastUpdated?.loans)}</span></div>
          <div><strong>🏦 Fixed Deposits</strong><br/><span>${window.formatDate(lastUpdated?.fds)}</span></div>
        </div>`;
        } catch (err) {
            document.getElementById('dashStats').innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><p>${err.message}</p></div>`;
        }
    }

    // Update rates
    document.getElementById('updateRatesBtn').addEventListener('click', async () => {
        const btn = document.getElementById('updateRatesBtn');
        btn.disabled = true; btn.textContent = '⏳ Updating…';
        try {
            const data = await API.post('/api/admin/update-rates', {});
            window.showToast(`✅ Updated: ${data.results.updated.creditCards} cards, ${data.results.updated.loans} loans, ${data.results.updated.fds} FDs`, 'success', 5000);
            if (currentSection === 'overview') loadDashboard();
            else if (currentSection === 'credit-cards') loadAdminCards();
            else if (currentSection === 'loans') loadAdminLoans();
            else if (currentSection === 'fixed-deposits') loadAdminFDs();
        } catch (err) {
            window.showToast('Update failed: ' + err.message, 'error');
        }
        btn.disabled = false; btn.textContent = '🔄 Update Latest Rates';
    });

    // ========== CREDIT CARDS CRUD ==========
    async function loadAdminCards() {
        const tbody = document.getElementById('admin-cards-tbody');
        tbody.innerHTML = '<tr><td colspan="7"><div class="loading-overlay"><div class="spinner"></div></div></td></tr>';
        try {
            const data = await API.get('/api/credit-cards?limit=100');
            const cards = data.data || [];
            tbody.innerHTML = cards.map(c => `
        <tr>
          <td>${c.bankName}</td><td><strong>${c.cardName}</strong></td>
          <td>${c.annualFee === 0 ? '<span style="color:var(--success)">FREE</span>' : '₹' + c.annualFee}</td>
          <td>${c.cashback}%</td>
          <td>${c.interestRate}%</td>
          <td><span class="reward-badge rb-${c.rewardsType}">${c.rewardsType}</span></td>
          <td>
            <div class="table-actions">
              <button class="btn btn-sm btn-secondary" onclick="editCard('${c._id}')">✏️ Edit</button>
              <button class="btn btn-sm btn-danger" onclick="deleteItem('${c._id}','card','${c.cardName}')">🗑️</button>
            </div>
          </td>
        </tr>`).join('') || '<tr><td colspan="7">No cards found.</td></tr>';
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="7" style="color:var(--danger);">${err.message}</td></tr>`;
        }
    }

    const CARD_FIELDS = [
        { name: 'bankName', label: 'Bank Name', type: 'text', required: true },
        { name: 'cardName', label: 'Card Name', type: 'text', required: true },
        { name: 'annualFee', label: 'Annual Fee (₹)', type: 'number', required: true },
        { name: 'joiningFee', label: 'Joining Fee (₹)', type: 'number' },
        { name: 'interestRate', label: 'Interest Rate (% p.a.)', type: 'number', required: true, step: '0.1' },
        { name: 'cashback', label: 'Cashback (%)', type: 'number', step: '0.25' },
        { name: 'rewardsType', label: 'Rewards Type', type: 'select', options: ['cashback', 'travel', 'shopping', 'fuel', 'dining', 'general'] },
        { name: 'eligibility', label: 'Eligibility', type: 'text' },
        { name: 'minIncome', label: 'Min Monthly Income (₹)', type: 'number' },
        { name: 'rating', label: 'Rating (0-5)', type: 'number', step: '0.1' },
        { name: 'applyUrl', label: 'Apply URL', type: 'url' },
        { name: 'rewardsDescription', label: 'Rewards Description', type: 'text' }
    ];

    document.getElementById('addCardBtn')?.addEventListener('click', () => openCrudModal('card', null));
    window.editCard = async (id) => {
        try {
            const data = await API.get('/api/credit-cards/' + id);
            openCrudModal('card', data.data);
        } catch (err) { window.showToast(err.message, 'error'); }
    };

    // ========== LOANS CRUD ==========
    async function loadAdminLoans() {
        const tbody = document.getElementById('admin-loans-tbody');
        tbody.innerHTML = '<tr><td colspan="7"><div class="loading-overlay"><div class="spinner"></div></div></td></tr>';
        try {
            const data = await API.get('/api/loans?limit=100');
            const loans = data.data || [];
            const typeColors = { personal: 'badge-blue', home: 'badge-green', car: 'badge-yellow' };
            tbody.innerHTML = loans.map(l => `
        <tr>
          <td><strong>${l.bankName}</strong></td><td>${l.loanName}</td>
          <td><span class="badge ${typeColors[l.loanType]}">${l.loanType}</span></td>
          <td class="table-rate">${l.interestRate}%</td><td>${l.processingFee}%</td>
          <td>${l.minTenure}–${l.maxTenure} mo</td>
          <td>
            <div class="table-actions">
              <button class="btn btn-sm btn-secondary" onclick="editLoan('${l._id}')">✏️ Edit</button>
              <button class="btn btn-sm btn-danger" onclick="deleteItem('${l._id}','loan','${l.loanName}')">🗑️</button>
            </div>
          </td>
        </tr>`).join('') || '<tr><td colspan="7">No loans found.</td></tr>';
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="7" style="color:var(--danger);">${err.message}</td></tr>`;
        }
    }

    const LOAN_FIELDS = [
        { name: 'bankName', label: 'Bank Name', type: 'text', required: true },
        { name: 'loanName', label: 'Loan Name', type: 'text', required: true },
        { name: 'loanType', label: 'Loan Type', type: 'select', options: ['personal', 'home', 'car'], required: true },
        { name: 'interestRate', label: 'Interest Rate (% p.a.)', type: 'number', required: true, step: '0.1' },
        { name: 'processingFee', label: 'Processing Fee (%)', type: 'number', step: '0.1' },
        { name: 'minTenure', label: 'Min Tenure (months)', type: 'number', required: true },
        { name: 'maxTenure', label: 'Max Tenure (months)', type: 'number', required: true },
        { name: 'minAmount', label: 'Min Amount (₹)', type: 'number', required: true },
        { name: 'maxAmount', label: 'Max Amount (₹)', type: 'number', required: true },
        { name: 'eligibility', label: 'Eligibility', type: 'text' },
        { name: 'rating', label: 'Rating (0-5)', type: 'number', step: '0.1' },
        { name: 'applyUrl', label: 'Apply URL', type: 'url' }
    ];

    document.getElementById('addLoanBtn')?.addEventListener('click', () => openCrudModal('loan', null));
    window.editLoan = async (id) => {
        try {
            const data = await API.get('/api/loans/' + id);
            openCrudModal('loan', data.data);
        } catch (err) { window.showToast(err.message, 'error'); }
    };

    // ========== FDs CRUD ==========
    async function loadAdminFDs() {
        const tbody = document.getElementById('admin-fds-tbody');
        tbody.innerHTML = '<tr><td colspan="7"><div class="loading-overlay"><div class="spinner"></div></div></td></tr>';
        try {
            const data = await API.get('/api/fds?limit=100');
            const fds = data.data || [];
            tbody.innerHTML = fds.map(f => `
        <tr>
          <td><strong>${f.bankName}</strong></td><td>${f.schemeName}</td>
          <td class="table-rate">${f.interestRate}%</td>
          <td style="color:var(--success);font-weight:600;">${f.seniorCitizenRate}%</td>
          <td>${f.minTenure} days</td>
          <td><span class="badge badge-blue">${f.bankType}</span></td>
          <td>
            <div class="table-actions">
              <button class="btn btn-sm btn-secondary" onclick="editFD('${f._id}')">✏️ Edit</button>
              <button class="btn btn-sm btn-danger" onclick="deleteItem('${f._id}','fd','${f.schemeName}')">🗑️</button>
            </div>
          </td>
        </tr>`).join('') || '<tr><td colspan="7">No FDs found.</td></tr>';
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="7" style="color:var(--danger);">${err.message}</td></tr>`;
        }
    }

    const FD_FIELDS = [
        { name: 'bankName', label: 'Bank Name', type: 'text', required: true },
        { name: 'schemeName', label: 'Scheme Name', type: 'text' },
        { name: 'interestRate', label: 'Interest Rate (% p.a.)', type: 'number', required: true, step: '0.25' },
        { name: 'seniorCitizenRate', label: 'Senior Citizen Rate (%)', type: 'number', required: true, step: '0.25' },
        { name: 'minTenure', label: 'Min Tenure (days)', type: 'number', required: true },
        { name: 'maxTenure', label: 'Max Tenure (days)', type: 'number', required: true },
        { name: 'minAmount', label: 'Min Amount (₹)', type: 'number' },
        { name: 'bankType', label: 'Bank Type', type: 'select', options: ['public', 'private', 'small_finance', 'nbfc'] },
        { name: 'compoundingFrequency', label: 'Compounding', type: 'select', options: ['quarterly', 'monthly', 'annually', 'simple'] },
        { name: 'rating', label: 'Rating (0-5)', type: 'number', step: '0.1' },
        { name: 'applyUrl', label: 'Apply URL', type: 'url' }
    ];

    document.getElementById('addFDBtn')?.addEventListener('click', () => openCrudModal('fd', null));
    window.editFD = async (id) => {
        try {
            const data = await API.get('/api/fds/' + id);
            openCrudModal('fd', data.data);
        } catch (err) { window.showToast(err.message, 'error'); }
    };

    // ========== Generic CRUD Modal ==========
    let crudType = null;
    let crudId = null;

    function getFields(type) {
        return { card: CARD_FIELDS, loan: LOAN_FIELDS, fd: FD_FIELDS }[type] || [];
    }

    function openCrudModal(type, data) {
        crudType = type; crudId = data?._id || null;
        const fields = getFields(type);
        const typeLabels = { card: 'Credit Card', loan: 'Loan', fd: 'Fixed Deposit' };
        document.getElementById('modalTitle').textContent = (data ? '✏️ Edit' : '➕ Add') + ' ' + typeLabels[type];

        document.getElementById('formFields').innerHTML = fields.map(f => {
            const val = data ? (data[f.name] !== undefined ? data[f.name] : '') : '';
            if (f.type === 'select') {
                return `<div class="form-group">
          <label>${f.label}</label>
          <select class="form-control" name="${f.name}" ${f.required ? 'required' : ''}>
            ${f.options.map(o => `<option value="${o}" ${val === o ? 'selected' : ''}>${o}</option>`).join('')}
          </select>
        </div>`;
            }
            return `<div class="form-group">
        <label>${f.label}${f.required ? ' <span style="color:var(--danger)">*</span>' : ''}</label>
        <input class="form-control" type="${f.type}" name="${f.name}" value="${val}" ${f.step ? `step="${f.step}"` : ''} ${f.required ? 'required' : ''} placeholder="${f.label}" />
      </div>`;
        }).join('');

        // Arrange in 2 cols
        document.getElementById('formFields').style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:0 1rem;';
        document.getElementById('crudModal').classList.add('active');
    }

    function closeCrudModal() {
        document.getElementById('crudModal').classList.remove('active');
        document.getElementById('crudForm').reset();
    }

    document.getElementById('closeCrudModal').addEventListener('click', closeCrudModal);
    document.getElementById('cancelCrud').addEventListener('click', closeCrudModal);
    document.getElementById('crudModal').addEventListener('click', e => { if (e.target === document.getElementById('crudModal')) closeCrudModal(); });

    document.getElementById('crudForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const saveBtn = document.getElementById('saveCrud');
        saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
        const formData = Object.fromEntries(new FormData(e.target));
        // Convert numeric fields
        Object.keys(formData).forEach(key => {
            if (formData[key] !== '' && !isNaN(formData[key])) formData[key] = parseFloat(formData[key]);
        });
        const endpoints = { card: '/api/credit-cards', loan: '/api/loans', fd: '/api/fds' };
        const ep = endpoints[crudType] + (crudId ? '/' + crudId : '');
        try {
            const result = crudId ? await API.put(ep, formData) : await API.post(ep, formData);
            if (result.success) {
                window.showToast((crudId ? 'Updated' : 'Created') + ' successfully!', 'success');
                closeCrudModal();
                if (crudType === 'card') loadAdminCards();
                else if (crudType === 'loan') loadAdminLoans();
                else if (crudType === 'fd') loadAdminFDs();
            }
        } catch (err) {
            window.showToast('Error: ' + err.message, 'error');
        }
        saveBtn.disabled = false; saveBtn.textContent = 'Save';
    });

    // ========== Delete ==========
    let deleteId = null; let deleteType = null;

    window.deleteItem = (id, type, name) => {
        deleteId = id; deleteType = type;
        document.querySelector('#deleteModal h3').textContent = `Delete "${name}"?`;
        document.getElementById('deleteModal').classList.add('active');
    };

    document.getElementById('cancelDelete').addEventListener('click', () => document.getElementById('deleteModal').classList.remove('active'));
    document.getElementById('confirmDelete').addEventListener('click', async () => {
        const endpoints = { card: '/api/credit-cards', loan: '/api/loans', fd: '/api/fds' };
        try {
            await API.del(endpoints[deleteType] + '/' + deleteId);
            window.showToast('Deleted successfully!', 'success');
            document.getElementById('deleteModal').classList.remove('active');
            if (deleteType === 'card') loadAdminCards();
            else if (deleteType === 'loan') loadAdminLoans();
            else if (deleteType === 'fd') loadAdminFDs();
            if (currentSection === 'overview') loadDashboard();
        } catch (err) {
            window.showToast('Delete failed: ' + err.message, 'error');
        }
    });

    // Init
    loadDashboard();
})();
