'use strict';

document.addEventListener('DOMContentLoaded', () => {
    setTimeGreeting();
    animateCounters();
});

function setTimeGreeting() {
    const hour = new Date().getHours();
    let greeting = window.t('js.dashboard.evening');
    if (hour < 12) greeting = window.t('js.dashboard.morning');
    else if (hour < 17) greeting = window.t('js.dashboard.afternoon');

    const el = document.getElementById('timeGreeting');
    if (el) el.textContent = greeting;
}

function animateCounters() {
    document.querySelectorAll('[data-target]').forEach(el => {
        const target = parseInt(el.dataset.target);
        if (isNaN(target)) return;
        let count = 0;
        const step = target / 40;
        const timer = setInterval(() => {
            count = Math.min(count + step, target);
            el.textContent = Math.floor(count);
            if (count >= target) clearInterval(timer);
        }, 30);
    });
}
