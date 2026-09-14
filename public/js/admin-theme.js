(function () {
    const saved = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
})();

document.addEventListener('DOMContentLoaded', function () {
    const btn = document.getElementById('admin-theme-toggle');
    if (!btn) return;

    const sunIcon  = document.getElementById('theme-icon-sun');
    const moonIcon = document.getElementById('theme-icon-moon');

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);

        if (sunIcon && moonIcon) {
            sunIcon.style.display  = theme === 'dark'  ? 'inline' : 'none';
            moonIcon.style.display = theme === 'light' ? 'inline' : 'none';
        }
        btn.title = theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode';
    }

    applyTheme(localStorage.getItem('theme') || 'dark');

    btn.addEventListener('click', function () {
        const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        applyTheme(next);
    });

    window.addEventListener('storage', function (e) {
        if (e.key === 'theme' && e.newValue) applyTheme(e.newValue);
    });

    const logoutLink = document.getElementById('logout-link');
    if (logoutLink) {
        logoutLink.addEventListener('click', async function (e) {
            e.preventDefault();
            await fetch('/api/auth/logout', { method: 'POST' }).catch(function () {});
            window.location.href = '/';
        });
    }
});
