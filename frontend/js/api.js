/**
 * js/api.js – FIN GUIDE Central API Module
 * Provides fetch helpers with JWT auth headers, toast notifications, and utility functions.
 */
window.FinAPI = (() => {
    const getToken = () => localStorage.getItem('fg_token');
    const getAdmin = () => JSON.parse(localStorage.getItem('fg_admin') || 'null');

    const headers = (extra = {}) => ({
        'Content-Type': 'application/json',
        ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
        ...extra,
    });

    const handle = async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) {
            localStorage.removeItem('fg_token');
            localStorage.removeItem('fg_admin');
            // Do not force redirect anymore, only redirect if on admin panel
            if (location.pathname.includes('admin')) location.href = '/admin-login.html';
        }
        return data;
    };

    return {
        getToken, getAdmin,
        async get(path) { return handle(await fetch(path, { headers: headers() })); },
        async post(path, body) { return handle(await fetch(path, { method: 'POST', headers: headers(), body: JSON.stringify(body) })); },
        async put(path, body) { return handle(await fetch(path, { method: 'PUT', headers: headers(), body: JSON.stringify(body) })); },
        async del(path) { return handle(await fetch(path, { method: 'DELETE', headers: headers() })); },

        /** Show floating toast notification */
        toast(msg, type = 'info') {
            const t = document.createElement('div');
            t.className = `toast toast-${type}`;
            t.textContent = msg;
            Object.assign(t.style, {
                position: 'fixed', bottom: '90px', right: '24px', background: type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : '#1a56db',
                color: 'white', padding: '12px 20px', borderRadius: '10px', fontFamily: 'Inter,sans-serif',
                fontSize: '.9rem', fontWeight: '600', zIndex: '9999', boxShadow: '0 4px 20px rgba(0,0,0,.2)',
                transition: 'opacity .3s', maxWidth: '320px',
            });
            document.body.appendChild(t);
            setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3000);
        },

        /** Format INR */
        inr(n) { return '₹' + Number(n).toLocaleString('en-IN'); },

        /** Common nav render */
        renderNav(containerId = 'navActions') {
            const el = document.getElementById(containerId);
            if (!el) return;
            const admin = getAdmin();
            const tok = getToken();
            if (tok && admin) {
                el.innerHTML = `
                    <a href="/admin-dashboard.html" class="btn btn-outline" style="border-color:var(--primary);color:var(--primary)">⚙️ Admin Panel</a>
                    <button onclick="localStorage.removeItem('fg_token');localStorage.removeItem('fg_admin');location.href='/'" class="btn btn-primary">Logout</button>
                `;
            } else {
                el.innerHTML = ``;
            }
        },
    };
})();
