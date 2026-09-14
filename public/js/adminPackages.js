'use strict';

let packages = [];
let currentDeleteId = null;
let currentPackageType = 'all';

const TYPE_LABEL = { single: 'Pump ur Adrenaline', day: 'Tal3a Packages', week: 'Rehla Packages' };

function loadData() {
    packages = (window.SERVER_DATA && window.SERVER_DATA.packages) ? window.SERVER_DATA.packages : [];
    updateStats();
    renderPackages();
}

function updateStats() {
    const el = (id) => document.getElementById(id);
    if (el('totalPackages'))  el('totalPackages').textContent  = packages.length;
    if (el('activePackages')) el('activePackages').textContent = packages.filter(p => p.status === 'active').length;

    let mostPopular = '--';
    if (packages.length) {
        const sorted = [...packages].sort((a, b) => (b.rating * b.reviews) - (a.rating * a.reviews));
        const name = sorted[0].name || '--';
        mostPopular = name.length > 15 ? name.slice(0, 15) + '…' : name;
    }
    if (el('mostPopular')) el('mostPopular').textContent = mostPopular;
}

function renderPackages() {
    const container = document.getElementById('packagesContainer');
    if (!container) return;

    let filtered = [...packages];
    const typeVal   = document.getElementById('typeFilter').value;
    const statusVal = document.getElementById('statusFilter').value;
    const search    = (document.getElementById('searchInput')?.value || '').toLowerCase();

    if (typeVal   !== 'all') filtered = filtered.filter(p => p.type   === typeVal);
    if (statusVal !== 'all') filtered = filtered.filter(p => p.status === statusVal);
    if (currentPackageType !== 'all') filtered = filtered.filter(p => p.type === currentPackageType);
    if (search) filtered = filtered.filter(p =>
        (p.name || '').toLowerCase().includes(search) || (p.city || '').toLowerCase().includes(search));

    if (!filtered.length) {
        container.innerHTML = `
            <div style="grid-column:1/-1;text-align:center;padding:60px 0;">
                <i class="fas fa-box-open" style="font-size:3rem;color:var(--color-border);margin-bottom:20px;display:block;"></i>
                <p style="color:var(--color-text-muted);font-size:1.1rem;">No packages match your filters.</p>
            </div>`;
        return;
    }

    container.innerHTML = filtered.map(createPackageCard).join('');
}

function esc(v) {
    return (v || '').toString().replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function createPackageCard(pkg) {
    const statusClass = pkg.status === 'active' ? 'status-active' : 'status-inactive';
    const desc = (pkg.description || '').slice(0, 90);
    return `
    <article class="package-card-refined">
        <div class="package-media">
            <img src="${esc(pkg.image) || '/images/WebsiteBanner.png'}" alt="${esc(pkg.name)}" onerror="this.src='/images/WebsiteBanner.png'">
            <span class="package-status-tag ${statusClass}">${pkg.status}</span>
        </div>
        <div class="package-content">
            <div class="package-meta">${TYPE_LABEL[pkg.type] || pkg.type}</div>
            <h4 class="package-title">${esc(pkg.name)}</h4>
            <p style="font-size:0.82rem;color:var(--color-text-muted);line-height:1.5;margin:6px 0 18px;">
                ${esc(desc)}${(pkg.description || '').length > 90 ? '…' : ''}
            </p>
            <div class="package-footer" style="justify-content:flex-end;">
                <div class="action-buttons">
                    <button class="btn-ghost" onclick="openEditModal('${pkg.id}')">Edit</button>
                    <button class="btn-danger" onclick="openDeleteModal('${pkg.id}', '${esc(pkg.name).replace(/'/g, "\\'")}')"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        </div>
    </article>`;
}

function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

function openCreateModal()    { openModal('selectTypeModal'); }
function selectPackageType(t) { closeModal('selectTypeModal'); setupForm(t); openModal('packageModal'); }

function setupForm(type, pkg) {
    const g = (id) => document.getElementById(id);
    g('packageForm').reset();
    g('modalTitle').textContent = pkg ? 'Edit Package' : 'Create ' + (TYPE_LABEL[type] || 'Package');
    g('packageId').value = pkg ? (pkg.id || pkg._id) : '';
    g('pkgType').value   = TYPE_LABEL[pkg ? pkg.type : type] || (pkg ? pkg.type : type);
    g('pkgType').dataset.type = pkg ? pkg.type : type;
    g('formError').style.display = 'none';

    const preview     = g('imagePreview');
    const placeholder = g('imageUploadPlaceholder');
    if (pkg && pkg.image) {
        preview.src = pkg.image; preview.style.display = 'block'; placeholder.style.display = 'none';
    } else {
        preview.src = ''; preview.style.display = 'none'; placeholder.style.display = 'block';
    }

    g('pkgName').value        = pkg ? (pkg.name || '') : '';
    g('pkgDescription').value = pkg ? (pkg.description || '') : '';
    g('pkgStatus').value      = pkg ? (pkg.status || 'active') : 'active';
    g('arPkgName').value        = pkg && pkg.ar ? (pkg.ar.name || '') : '';
    g('arPkgDescription').value = pkg && pkg.ar ? (pkg.ar.description || '') : '';
}

function openEditModal(id) {
    const pkg = packages.find(p => p.id === id || p._id === id);
    if (!pkg) return;
    setupForm(pkg.type, pkg);
    openModal('packageModal');
}

async function savePackage() {
    const g = (id) => document.getElementById(id);
    const id   = g('packageId').value;
    const type = g('pkgType').dataset.type;
    const name = g('pkgName').value.trim();

    const errDiv = g('formError');
    const showErr = (msg) => { g('formErrorMsg').textContent = msg; errDiv.style.display = 'block'; };

    if (name.length < 3) { showErr('Name must be at least 3 characters.'); return; }

    const payload = {
        type,
        name,
        description: g('pkgDescription').value.trim(),
        status: g('pkgStatus').value,
        ar: {
            name: g('arPkgName').value.trim(),
            description: g('arPkgDescription').value.trim(),
        },
    };

    const saveBtn = g('savePackageBtn');
    saveBtn.textContent = 'Saving…'; saveBtn.disabled = true;
    errDiv.style.display = 'none';

    try {
        const url    = id ? '/api/packages/' + id : '/api/packages';
        const method = id ? 'PUT' : 'POST';
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Save failed');

        const pkgId = id || data.data.package._id;
        const imageFile = g('pkgImageFile').files[0];
        if (imageFile && pkgId) {
            const fd = new FormData();
            fd.append('image', imageFile);
            await fetch('/api/packages/' + pkgId + '/image', { method: 'POST', credentials: 'include', body: fd });
        }

        window.location.reload();
    } catch (err) {
        showErr(err.message);
        saveBtn.textContent = 'Save Changes'; saveBtn.disabled = false;
    }
}

function openDeleteModal(id, name) {
    currentDeleteId = id;
    document.getElementById('deletePackageName').textContent = name;
    openModal('deleteModal');
}

async function confirmDelete() {
    if (!currentDeleteId) return;
    try {
        const res = await fetch('/api/packages/' + currentDeleteId, { method: 'DELETE', credentials: 'include' });
        if (res.ok || res.status === 204) { window.location.reload(); return; }
        const d = await res.json();
        alert(d.message || 'Delete failed');
    } catch (err) {
        alert('An error occurred: ' + err.message);
    }
}

function initFilters() {
    document.getElementById('searchInput').addEventListener('input', renderPackages);
    document.getElementById('typeFilter').addEventListener('change', renderPackages);
    document.getElementById('statusFilter').addEventListener('change', renderPackages);

    document.querySelectorAll('.tab-link').forEach(tab => {
        tab.addEventListener('click', function () {
            document.querySelectorAll('.tab-link').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            currentPackageType = this.dataset.type;
            renderPackages();
        });
    });
}

function init() {
    loadData();
    initFilters();

    document.getElementById('pkgImageFile').addEventListener('change', function () {
        const file = this.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('imagePreview').src = e.target.result;
            document.getElementById('imagePreview').style.display = 'block';
            document.getElementById('imageUploadPlaceholder').style.display = 'none';
        };
        reader.readAsDataURL(file);
    });

    document.getElementById('createPackageBtn').onclick = openCreateModal;
    document.getElementById('savePackageBtn').onclick   = savePackage;
    document.getElementById('confirmDeleteBtn').onclick = confirmDelete;

    document.querySelectorAll('.type-btn').forEach(btn => {
        btn.onclick = () => selectPackageType(btn.dataset.type);
    });
}

window.openEditModal   = openEditModal;
window.openDeleteModal = openDeleteModal;
window.closeModal      = closeModal;

document.addEventListener('DOMContentLoaded', init);
