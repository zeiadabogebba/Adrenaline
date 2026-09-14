// Questions and answers come from locales/<lang>/faq.json, rendered into the page by faq.ejs.
const faqData = window.FAQ_ITEMS || [];

let selectedCategory = null;

const faqContainer = document.getElementById('faqContainer');
const tabBtns = document.querySelectorAll('.tab-btn');

document.addEventListener('DOMContentLoaded', function() {
    renderFAQs();
    attachEventListeners();
});

function renderFAQs() {
    let filteredFAQs = faqData;

    if (selectedCategory !== null) {
        filteredFAQs = faqData.filter(faq => faq.category === selectedCategory);
    }

    if (filteredFAQs.length === 0) {
        faqContainer.innerHTML = `<div class="no-results">${window.FAQ_NO_RESULTS || 'No questions found in this category.'}</div>`;
        return;
    }

    faqContainer.innerHTML = '';

    filteredFAQs.forEach(faq => {
        const faqItem = createFAQItem(faq);
        faqContainer.appendChild(faqItem);
    });
}

function createFAQItem(faq) {
    const item = document.createElement('div');
    item.className = 'faq-item';
    item.setAttribute('data-id', faq.id);

    item.innerHTML = `
        <div class="faq-question">
            <span>${faq.question}</span>
            <i class="fas fa-chevron-right faq-icon"></i>
        </div>
        <div class="faq-answer">
            ${faq.answer}
        </div>
    `;

    const questionDiv = item.querySelector('.faq-question');

    questionDiv.addEventListener('click', function() {
        const isOpening = !item.classList.contains('active');

        document.querySelectorAll('.faq-item.active').forEach(activeItem => {
            if (activeItem !== item) {
                activeItem.classList.remove('active');
                activeItem.querySelector('.faq-answer').classList.remove('show');
            }
        });

        if (isOpening) {
            item.classList.add('active');
            item.querySelector('.faq-answer').classList.add('show');
        } else {
            item.classList.remove('active');
            item.querySelector('.faq-answer').classList.remove('show');
        }
    });

    return item;
}

function handleTabClick(clickedBtn, category) {
    const isCurrentlySelected = clickedBtn.classList.contains('active');

    if (isCurrentlySelected) {

        clickedBtn.classList.remove('active');
        selectedCategory = null;
    } else {

        tabBtns.forEach(btn => btn.classList.remove('active'));
        clickedBtn.classList.add('active');
        selectedCategory = category;
    }

    renderFAQs();
}

function attachEventListeners() {
    tabBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const category = this.getAttribute('data-category');
            handleTabClick(this, category);
        });
    });
}
