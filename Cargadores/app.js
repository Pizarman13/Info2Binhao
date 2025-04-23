// ————————————————————————————————————————
// 1) UTILIDADES DE STORAGE
// ————————————————————————————————————————
function load(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; }
    catch { return fallback; }
}
function save(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
}

// Inicializar arrays/objetos si no existen
if (!localStorage.getItem('users'))        save('users',        []);
if (!localStorage.getItem('chargers'))     save('chargers',     []);
if (!localStorage.getItem('reservations')) save('reservations', []);
if (!localStorage.getItem('logs'))         save('logs',         []);
if (!localStorage.getItem('incidents'))    save('incidents',    []);
if (!localStorage.getItem('chargerStatus'))save('chargerStatus', {});

let currentUser = null;

// ————————————————————————————————————————
// 2) ALERTAS
// ————————————————————————————————————————
const alertContainer = document.getElementById('alert-container');
function showAlert(msg, type='danger') {
    alertContainer.innerHTML = `
    <div class="alert alert-${type} alert-dismissible fade show" role="alert">
      ${msg}
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    </div>`;
}

// ————————————————————————————————————————
// 3) LOGOUT
// ————————————————————————————————————————
document.getElementById('logout-btn').addEventListener('click', () => {
    document.getElementById('dashboard-container').classList.add('d-none');
    document.getElementById('auth-container').classList.remove('d-none');
    ['usuario','administrador','tecnico'].forEach(r => {
        document.getElementById(r+'-dashboard').classList.add('d-none');
    });
    showAlert('', '');
    document.getElementById('login-form').reset();
    document.getElementById('register-form').reset();
});

// ————————————————————————————————————————
// 4) REGISTER
// ————————————————————————————————————————
document.getElementById('register-form').addEventListener('submit', e => {
    e.preventDefault();
    const u  = document.getElementById('register-username').value.trim();
    const p  = document.getElementById('register-password').value;
    const p2 = document.getElementById('register-password2').value;
    const r  = document.getElementById('register-role').value;
    let users = load('users', []);
    if (p !== p2)             return showAlert('Las contraseñas no coinciden.','warning');
    if (users.find(x=>x.username===u)) return showAlert('Usuario ya existe.','warning');
    users.push({ username:u, password:p, role:r });
    save('users', users);
    showAlert('¡Registro exitoso! Ya puedes iniciar sesión.','success');
    new bootstrap.Tab(document.getElementById('login-tab')).show();
    e.target.reset();
});

// ————————————————————————————————————————
// 5) LOGIN
// ————————————————————————————————————————
document.getElementById('login-form').addEventListener('submit', e => {
    e.preventDefault();
    const u = document.getElementById('login-username').value.trim();
    const p = document.getElementById('login-password').value;
    const r = document.getElementById('login-role').value;
    let users = load('users', []);
    const me = users.find(x => x.username === u);
    if (!me)           return showAlert('Usuario no registrado.','danger');
    if (me.password!==p) return showAlert('Contraseña incorrecta.','danger');
    if (me.role      !==r) return showAlert(`Debes iniciar como ${me.role}.`,'warning');

    // Login OK
    currentUser = u;
    showAlert(`¡Bienvenido, ${u}! Como ${r}.`,'success');
    document.getElementById('auth-container').classList.add('d-none');
    document.getElementById('dashboard-container').classList.remove('d-none');

    // Mostrar sólo su dashboard
    if (r === 'Usuario') {
        document.getElementById('usuario-dashboard').classList.remove('d-none');
        initUsuario();
    }
    if (r === 'Administrador') {
        document.getElementById('administrador-dashboard').classList.remove('d-none');
        initAdmin();
    }
    if (r === 'Técnico') {
        document.getElementById('tecnico-dashboard').classList.remove('d-none');
        initTecnico();
    }
});

// ————————————————————————————————————————
// 6) DASHBOARD USUARIO
// ————————————————————————————————————————
let userMap, userService;
function initUsuario() {
    userMap = new google.maps.Map(document.getElementById('map'), {
        center: { lat:40.4168, lng:-3.7038 }, zoom:13
    });
    userService = new google.maps.places.PlacesService(userMap);
    navigator.geolocation.getCurrentPosition(pos=>{
        const loc = { lat:pos.coords.latitude, lng:pos.coords.longitude };
        userMap.setCenter(loc);
        userService.nearbySearch({ location:loc, radius:5000, type:'electric_vehicle_charging_station' },
            renderChargersUsuario);
    }, ()=> renderChargersUsuario([], 'ERROR'));
    renderHistorial();
}
function renderChargersUsuario(results, status) {
    const ul = document.getElementById('charger-list');
    ul.innerHTML = '';
    if (status !== google.maps.places.PlacesServiceStatus.OK) return;
    results.forEach(place => {
        const li = document.createElement('li');
        li.className = 'list-group-item d-flex justify-content-between align-items-start';
        li.innerHTML = `
      <div>
        <strong>${place.name}</strong><br>${place.vicinity}
      </div>
      <button class="btn btn-sm btn-outline-primary">Ver / Reservar</button>
    `;
        li.querySelector('button').onclick = ()=> showDetailsAndReserve(place, place.place_id);
        ul.append(li);
    });
}
function showDetailsAndReserve(place, id) {
    userService.getDetails({ placeId:id }, (p, st) => {
        if (st!==google.maps.places.PlacesServiceStatus.OK) return;
        const key = `${currentUser}___${id}`;
        const reserved = !!load('reservations', []).find(r=>r.key===key);
        const ok = confirm(
            `${p.name}\n${p.formatted_address}\n\n` +
            (reserved
                ? 'Ya tienes esta estación. ¿Cancelar?'
                : '¿Reservar esta estación?')
        );
        if (!ok) return;
        let all = load('reservations', []);
        if (reserved) {
            all = all.filter(r=>r.key!==key);
            logAction(`${currentUser}`, `canceló reserva ${p.name}`);
        } else {
            all.push({ key, username:currentUser, chargerId:id, name:p.name, date:new Date() });
            logAction(`${currentUser}`, `reservó ${p.name}`);
        }
        save('reservations', all);
        renderHistorial();
    });
}
function renderHistorial() {
    const hist = load('reservations', [])
        .filter(r=>r.username===currentUser);
    const ul = document.getElementById('reservation-history');
    ul.innerHTML = '';
    hist.forEach(r=>{
        const li = document.createElement('li');
        li.className = 'list-group-item';
        li.textContent = `${r.name} — ${new Date(r.date).toLocaleString()}`;
        ul.append(li);
    });
}

// ————————————————————————————————————————
// 7) DASHBOARD ADMINISTRADOR
// ————————————————————————————————————————
function initAdmin() {
    renderChargersAdmin();
    renderStats();
    renderLogs();
    document.getElementById('add-charger-form')
        .addEventListener('submit', e=>{
            e.preventDefault();
            const name = document.getElementById('new-charger-name').value;
            const lat  = +document.getElementById('new-charger-lat').value;
            const lng  = +document.getElementById('new-charger-lng').value;
            let all = load('chargers', []);
            const id  = Date.now().toString();
            all.push({ id, name, lat, lng });
            save('chargers', all);
            logAction(currentUser, `añadió cargador ${name}`);
            renderChargersAdmin();
            renderStats();
            e.target.reset();
        });
}
function renderChargersAdmin() {
    const ul = document.getElementById('charger-admin-list');
    const all = load('chargers', []);
    ul.innerHTML = '';
    all.forEach(c=>{
        const li = document.createElement('li');
        li.className = 'list-group-item d-flex justify-content-between';
        li.innerHTML = `
      ${c.name} (${c.lat.toFixed(3)}, ${c.lng.toFixed(3)})
      <button class="btn btn-sm btn-danger">Eliminar</button>
    `;
        li.querySelector('button').onclick = ()=>{
            if(!confirm('Eliminar este cargador?')) return;
            save('chargers', all.filter(x=>x.id!==c.id));
            logAction(currentUser, `eliminó cargador ${c.name}`);
            renderChargersAdmin();
            renderStats();
        };
        ul.append(li);
    });
}
function renderStats() {
    const statsDiv = document.getElementById('admin-stats');
    const reservas = load('reservations', []);
    const byCharger = reservas.reduce((acc,r)=>{
        acc[r.name] = (acc[r.name]||0)+1;
        return acc;
    }, {});
    statsDiv.innerHTML = `
    <ul class="list-group">
      ${Object.entries(byCharger).map(([nm,ct])=>`
        <li class="list-group-item">${nm}: ${ct} reserva(s)</li>
      `).join('')}
    </ul>
  `;
}
function renderLogs() {
    const ul = document.getElementById('admin-logs');
    ul.innerHTML = '';
    load('logs', []).forEach(log=>{
        const li = document.createElement('li');
        li.className = 'list-group-item';
        li.textContent = `[${new Date(log.date).toLocaleString()}] ${log.user}: ${log.action}`;
        ul.append(li);
    });
}

// ————————————————————————————————————————
// 8) DASHBOARD TÉCNICO
// ————————————————————————————————————————
let techMap, techService;
function initTecnico() {
    techMap = new google.maps.Map(document.getElementById('tech-map'), {
        center: { lat:40.4168, lng:-3.7038 }, zoom:13
    });
    techService = new google.maps.places.PlacesService(techMap);

    navigator.geolocation.getCurrentPosition(pos=>{
        const loc = { lat:pos.coords.latitude, lng:pos.coords.longitude };
        techMap.setCenter(loc);
        techService.nearbySearch({ location:loc, radius:5000, type:'electric_vehicle_charging_station' },
            renderChargersTech);
    }, ()=> renderChargersTech([], 'ERROR'));

    renderIncidents();
    document.getElementById('report-incident-form')
        .addEventListener('submit', e=>{
            e.preventDefault();
            const chargerId = document.getElementById('incident-charger').value;
            const desc      = document.getElementById('incident-desc').value;
            let incs = load('incidents', []);
            incs.push({ chargerId, desc, date:new Date() });
            save('incidents', incs);
            logAction(currentUser, `reportó incidencia en ${chargerId}`);
            renderIncidents();
            e.target.reset();
        });
}

function renderChargersTech(results, status) {
    const ul = document.getElementById('tech-charger-list');
    ul.innerHTML = '';
    const statusMap = load('chargerStatus', {});
    const sel = document.getElementById('incident-charger');
    sel.innerHTML = '';

    if (status !== google.maps.places.PlacesServiceStatus.OK) return;
    results.forEach(place => {
        const id = place.place_id;
        const enabled = statusMap[id] !== false;
        // item
        const li = document.createElement('li');
        li.className = 'list-group-item d-flex justify-content-between align-items-start';
        li.innerHTML = `
      <div>
        <strong>${place.name}</strong><br>${place.vicinity}
      </div>
      <div class="d-flex align-items-center">
        <div class="form-check form-switch me-3">
          <input class="form-check-input" type="checkbox" id="switch-${id}" ${enabled?'checked':''}>
          <label class="form-check-label" for="switch-${id}">${enabled?'Habilitado':'Inhabilitado'}</label>
        </div>
        <button class="btn btn-sm btn-info me-2" id="detail-${id}">Detalles</button>
      </div>
    `;
        ul.append(li);

        // llenar select de incidencias
        const opt = document.createElement('option');
        opt.value = id; opt.textContent = place.name;
        sel.append(opt);

        // switch listener
        li.querySelector(`#switch-${id}`).addEventListener('change', function(){
            statusMap[id] = this.checked;
            save('chargerStatus', statusMap);
            this.nextElementSibling.textContent = this.checked?'Habilitado':'Inhabilitado';
        });

        // detalles listener
        li.querySelector(`#detail-${id}`).addEventListener('click', ()=>{
            techService.getDetails({ placeId:id }, (p, st)=>{
                if (st!==google.maps.places.PlacesServiceStatus.OK) return;
                const body = document.getElementById('tech-details-body');
                body.innerHTML = `
          <p><strong>Nombre:</strong> ${p.name}</p>
          <p><strong>Dirección:</strong> ${p.formatted_address||'N/A'}</p>
          <p><strong>Teléfono:</strong> ${p.formatted_phone_number||'N/A'}</p>
          <p><strong>Web:</strong> ${p.website?`<a href="${p.website}" target="_blank">${p.website}</a>`:'N/A'}</p>
          <p><strong>Tipos:</strong> ${(p.types||[]).join(', ')}</p>
        `;
                new bootstrap.Modal(document.getElementById('techDetailsModal')).show();
            });
        });
    });
}

function renderIncidents() {
    const ul = document.getElementById('incident-list');
    ul.innerHTML = '';
    load('incidents', []).forEach(i=>{
        const li = document.createElement('li');
        li.className = 'list-group-item';
        li.textContent = `${i.chargerId}: ${i.desc} — ${new Date(i.date).toLocaleString()}`;
        ul.append(li);
    });
}

// ————————————————————————————————————————
// 9) LOGS
// ————————————————————————————————————————
function logAction(user, action) {
    const logs = load('logs', []);
    logs.push({ user, action, date:new Date() });
    save('logs', logs);
}

