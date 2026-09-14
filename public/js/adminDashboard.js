'use strict';

function updateSystemHealth() {
    const statuses  = ['Excellent', 'Stable', 'Running Smoothly'];
    const statusText = document.getElementById('health-text');
    setInterval(() => {
        if (statusText) {
            statusText.textContent = statuses[Math.floor(Math.random() * statuses.length)];
        }
    }, 10000);
}

document.addEventListener('DOMContentLoaded', () => {
    updateSystemHealth();
});
