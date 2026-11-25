const STORAGE_KEY = "novavet_san_francisco_prod_v2";

const INITIAL_DATA = {
  users: [
    {
      id: 1,
      name: "Dirección General",
      email: "admin@sanfrancisco.vet",
      password: "admin123",
      role: "ADMIN",
      active: true
    },
    {
      id: 2,
      name: "Dra. Valentina Ríos",
      email: "vet@sanfrancisco.vet",
      password: "vet123",
      role: "VET",
      active: true
    },
    {
      id: 3,
      name: "Recepción Principal",
      email: "recepcion@sanfrancisco.vet",
      password: "recep123",
      role: "RECEP",
      active: true
    }
  ],
  owners: [
    { id: 1, name: "Andrés Castro", phone: "3004567890", address: "Cra. 50 # 72-14" }
  ],
  pets: [
    { id: 1, ownerId: 1, name: "Max", species: "Canino", breed: "Golden Retriever", age: "3 años" }
  ],
  appointments: [
    {
      id: 1,
      petId: 1,
      vetName: "Dra. Valentina Ríos",
      date: getLocalDateString(),
      time: "09:00",
      reason: "Control general y vacunación",
      status: "Confirmada"
    }
  ],
  records: [],
  inventory: [
    { id: 1, item: "Vacuna Antirrábica", category: "Biológicos", stock: 20, minStock: 10 },
    { id: 2, item: "Amoxicilina Suspensión 250mg", category: "Medicamentos", stock: 12, minStock: 8 },
    { id: 3, item: "Gasas Estériles (Paquete)", category: "Insumos", stock: 15, minStock: 10 }
  ]
};

const ROLE_MENUS = {
  ADMIN: [
    { id: "dashboard", label: "Panel de Control" },
    { id: "users", label: "Gestión de Personal y Claves" },
    { id: "inventory", label: "Inventario General" },
    { id: "reports", label: "Reportes y Respaldos" }
  ],
  VET: [
    { id: "agenda", label: "Agenda Médica y Consultas" },
    { id: "records", label: "Historias Clínicas y Recetas" },
    { id: "patients", label: "Pacientes e Historial" },
    { id: "stock_view", label: "Consulta de Stock" }
  ],
  RECEP: [
    { id: "reception_flow", label: "Propietarios, Pacientes y Citas" },
    { id: "appointments_manage", label: "Control de Turnos" },
    { id: "search", label: "Directorio General" }
  ]
};

const ROLE_LABELS = {
  ADMIN: "Dirección / Administrador",
  VET: "Médico Veterinario",
  RECEP: "Recepción y Admisiones"
};

let db = loadDb();
let selectedLoginRole = "ADMIN";
let currentRole = null;
let currentUser = null;
let activeSection = null;
let preselectedPetForRecord = null;

function getLocalDateString() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function loadDb() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (_) {
      return structuredClone(INITIAL_DATA);
    }
  }
  const fresh = structuredClone(INITIAL_DATA);
  saveDbToStorage(fresh);
  return fresh;
}

function saveDbToStorage(data = db) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function saveDb() {
  saveDbToStorage(db);
}

function notify(message, type = "ok") {
  const banner = document.getElementById("alert-banner");
  if (!banner) return;
  banner.textContent = message;
  banner.className = `alert-banner ${type}`;
  clearTimeout(notify._timer);
  notify._timer = setTimeout(() => {
    banner.className = "alert-banner hidden";
  }, 4500);
}

function getPet(petId) {
  return db.pets.find((p) => p.id === Number(petId));
}

function getPetName(petId) {
  return getPet(petId)?.name || "Paciente";
}

function getOwnerByPet(petId) {
  const pet = getPet(petId);
  if (!pet) return null;
  return db.owners.find((o) => o.id === pet.ownerId) || null;
}

function getOwnerNameByPet(petId) {
  return getOwnerByPet(petId)?.name || "—";
}

function getStatusPillClass(status) {
  if (status === "Confirmada" || status === "Atendida") return "pill-ok";
  if (status === "Cancelada") return "pill-err";
  return "pill-warn";
}

function syncLoginTab(role) {
  selectedLoginRole = role;
  document.querySelectorAll("#role-tabs .nv-role-card").forEach((b) => {
    b.classList.toggle("active", b.dataset.role === role);
    b.setAttribute("aria-pressed", String(b.dataset.role === role));
  });
  document.getElementById("role-section-hint").innerHTML =
    `Sección seleccionada: <strong>${ROLE_LABELS[role]}</strong>. Solo puede ingresar personal con este rol y su contraseña.`;
  const defaultUserForRole = db.users.find((u) => u.role === role && u.active);
  document.getElementById("login-email").value = defaultUserForRole ? defaultUserForRole.email : "";
  document.getElementById("login-password").value = "";
}

document.querySelectorAll("#role-tabs .nv-role-card").forEach((btn) => {
  btn.addEventListener("click", () => syncLoginTab(btn.dataset.role));
});

document.getElementById("login-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const email = document.getElementById("login-email").value.trim().toLowerCase();
  const password = document.getElementById("login-password").value;

  const user = db.users.find((u) => u.email.toLowerCase() === email);
  if (!user) {
    notify("Correo no registrado en la clínica.", "err");
    return;
  }
  if (!user.active) {
    notify("Esta cuenta está suspendida.", "err");
    return;
  }
  if (user.role !== selectedLoginRole) {
    notify(`Este correo pertenece a ${ROLE_LABELS[user.role]}. Cámbiala a su sección correspondiente.`, "err");
    return;
  }
  if (user.password !== password) {
    notify("Contraseña incorrecta para este rol.", "err");
    return;
  }

  enterSystem(user);
});

function enterSystem(user) {
  currentRole = user.role;
  currentUser = user;
  activeSection = ROLE_MENUS[currentRole][0].id;

  const banner = document.getElementById("alert-banner");
  if (banner) {
    clearTimeout(notify._timer);
    banner.textContent = "";
    banner.className = "alert-banner hidden";
  }

  document.getElementById("login-view").classList.add("hidden");
  document.getElementById("app-shell").classList.remove("hidden");
  document.getElementById("active-role-tag").textContent = `● ${ROLE_LABELS[currentRole]}`;
  document.getElementById("session-user").innerHTML =
    `<strong>${user.name}</strong><br><span class="muted">${ROLE_LABELS[currentRole]}</span>`;

  renderMenu();
  renderSection();
}

const logoutButton = document.getElementById("logout-btn");
if (logoutButton) {
  logoutButton.addEventListener("click", () => {
    currentRole = null;
    currentUser = null;
    activeSection = null;
    document.getElementById("app-shell").classList.add("hidden");
    document.getElementById("login-view").classList.remove("hidden");
    syncLoginTab(selectedLoginRole);
  });
}

function renderMenu() {
  const menu = document.getElementById("nav-menu");
  menu.innerHTML = "";
  const allowedMenu = ROLE_MENUS[currentRole] || [];
  allowedMenu.forEach((item) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `nav-item ${item.id === activeSection ? "active" : ""}`;
    btn.textContent = item.label;
    btn.addEventListener("click", () => {
      activeSection = item.id;
      renderMenu();
      renderSection();
    });
    menu.appendChild(btn);
  });
}

function renderSection() {
  if (!currentRole || !currentUser) return;
  const allowedIds = (ROLE_MENUS[currentRole] || []).map((m) => m.id);
  if (!allowedIds.includes(activeSection)) {
    activeSection = allowedIds[0];
  }

  const area = document.getElementById("content-area");
  const titleEl = document.getElementById("view-title");
  const currentMenuItem = ROLE_MENUS[currentRole].find((m) => m.id === activeSection);
  titleEl.textContent = currentMenuItem ? currentMenuItem.label : "Panel";

  const renderers = {
    dashboard: () => renderDashboard(area),
    users: () => renderUsers(area),
    inventory: () => renderInventory(area, true),
    reports: () => renderReports(area),
    agenda: () => renderAgenda(area),
    records: () => renderRecords(area),
    patients: () => renderPatientsWithHistory(area),
    stock_view: () => renderInventory(area, false),
    reception_flow: () => renderReceptionFlow(area),
    appointments_manage: () => renderAppointmentsManage(area),
    search: () => renderSearch(area)
  };

  if (renderers[activeSection]) {
    renderers[activeSection]();
  }
}

// ADMINISTRADOR
function renderDashboard(area) {
  const lowStock = db.inventory.filter((i) => i.stock <= i.minStock).length;
  const activeCitas = db.appointments.filter((a) => a.status !== "Cancelada").length;

  area.innerHTML = `
    <div class="kpi-grid">
      <div class="kpi-card"><span>Propietarios activos</span><strong>${db.owners.length}</strong></div>
      <div class="kpi-card"><span>Pacientes registrados</span><strong>${db.pets.length}</strong></div>
      <div class="kpi-card"><span>Citas vigentes</span><strong>${activeCitas}</strong></div>
      <div class="kpi-card"><span>Alertas de inventario</span><strong>${lowStock}</strong></div>
    </div>
    <div class="card">
      <h3>Programación clínica reciente</h3>
      <table>
        <thead><tr><th>Fecha</th><th>Hora</th><th>Paciente</th><th>Propietario</th><th>Veterinario</th><th>Estado</th></tr></thead>
        <tbody>
          ${db.appointments.map((a) => `
            <tr>
              <td>${a.date}</td>
              <td>${a.time}</td>
              <td><strong>${getPetName(a.petId)}</strong></td>
              <td>${getOwnerNameByPet(a.petId)}</td>
              <td>${a.vetName}</td>
              <td><span class="pill ${getStatusPillClass(a.status)}">${a.status}</span></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderUsers(area) {
  area.innerHTML = `
    <div class="two-col">
      <div class="card">
        <h3>Registrar colaborador y asignar contraseña</h3>
        <form id="user-form" class="form-stack">
          <label>Nombre completo <input type="text" id="u-name" required /></label>
          <label>Correo institucional <input type="email" id="u-email" placeholder="colaborador@sanfrancisco.vet" required /></label>
          <label>Contraseña asignada <input type="password" id="u-pass" minlength="4" required /></label>
          <label>Sección / Rol asignado
            <select id="u-role">
              <option value="ADMIN">Dirección / Administrador</option>
              <option value="VET">Médico Veterinario</option>
              <option value="RECEP">Recepción y Admisiones</option>
            </select>
          </label>
          <button type="submit" class="btn-primary">Guardar usuario y clave</button>
        </form>
      </div>
      <div class="card">
        <h3>Equipo autorizado</h3>
        <table>
          <thead><tr><th>Colaborador</th><th>Sección</th><th>Estado</th><th>Control</th></tr></thead>
          <tbody>
            ${db.users.map((u) => `
              <tr>
                <td><strong>${u.name}</strong><br><span class="muted">${u.email}</span></td>
                <td>${ROLE_LABELS[u.role]}</td>
                <td><span class="pill ${u.active ? "pill-ok" : "pill-err"}">${u.active ? "Activo" : "Suspendido"}</span></td>
                <td><button type="button" class="btn-outline" onclick="toggleUser(${u.id})">${u.active ? "Suspender" : "Habilitar"}</button></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById("user-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const email = document.getElementById("u-email").value.trim().toLowerCase();
    if (db.users.some((u) => u.email.toLowerCase() === email)) {
      notify("Este correo ya se encuentra registrado.", "err");
      return;
    }
    db.users.push({
      id: Date.now(),
      name: document.getElementById("u-name").value.trim(),
      email,
      password: document.getElementById("u-pass").value,
      role: document.getElementById("u-role").value,
      active: true
    });
    saveDb();
    renderUsers(area);
    notify("Usuario y contraseña registrados.");
  });
}

window.toggleUser = function (id) {
  if (currentRole !== "ADMIN") return;
  const user = db.users.find((u) => u.id === id);
  if (!user) return;
  if (user.id === currentUser.id) {
    notify("No puedes suspender tu propia sesión activa.", "err");
    return;
  }
  user.active = !user.active;
  saveDb();
  renderUsers(document.getElementById("content-area"));
  notify(`Estado de ${user.name} actualizado.`);
};

function renderInventory(area, canEdit) {
  area.innerHTML = `
    <div class="${canEdit ? "two-col" : ""}">
      ${canEdit ? `
        <div class="card">
          <h3>Alta de insumo o medicamento</h3>
          <form id="inv-add-form" class="form-stack">
            <label>Descripción del producto <input type="text" id="inv-name" required /></label>
            <label>Categoría
              <select id="inv-cat">
                <option value="Medicamentos">Medicamentos</option>
                <option value="Biológicos">Biológicos</option>
                <option value="Insumos">Insumos Quirúrgicos / Curación</option>
              </select>
            </label>
            <label>Existencia inicial <input type="number" id="inv-stock" min="0" value="10" required /></label>
            <label>Stock mínimo de alerta <input type="number" id="inv-min" min="1" value="5" required /></label>
            <button type="submit" class="btn-primary">Registrar en inventario</button>
          </form>
        </div>
      ` : ""}

      <div class="card">
        <h3>${canEdit ? "Control de Existencias" : "Disponibilidad en Bodega (Solo lectura)"}</h3>
        <table>
          <thead><tr><th>Producto</th><th>Categoría</th><th>Existencia</th><th>Mínimo</th><th>Estado</th>${canEdit ? "<th>Movimiento</th>" : ""}</tr></thead>
          <tbody>
            ${db.inventory.map((item) => {
              const isLow = item.stock <= item.minStock;
              return `
                <tr>
                  <td><strong>${item.item}</strong></td>
                  <td>${item.category}</td>
                  <td>${item.stock}</td>
                  <td>${item.minStock}</td>
                  <td><span class="pill ${isLow ? "pill-err" : "pill-ok"}">${isLow ? "Reabastecer" : "Óptimo"}</span></td>
                  ${canEdit ? `
                    <td class="row-actions">
                      <button type="button" class="btn-secondary" onclick="adjustStock(${item.id}, 1)">+1</button>
                      <button type="button" class="btn-outline" onclick="adjustStock(${item.id}, -1)">-1</button>
                    </td>
                  ` : ""}
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;

  if (canEdit) {
    document.getElementById("inv-add-form").addEventListener("submit", (e) => {
      e.preventDefault();
      db.inventory.push({
        id: Date.now(),
        item: document.getElementById("inv-name").value.trim(),
        category: document.getElementById("inv-cat").value,
        stock: Number(document.getElementById("inv-stock").value),
        minStock: Number(document.getElementById("inv-min").value)
      });
      saveDb();
      renderInventory(area, true);
      notify("Producto incorporado al inventario.");
    });
  }
}

window.adjustStock = function (id, delta) {
  if (currentRole !== "ADMIN") return;
  const item = db.inventory.find((i) => i.id === id);
  if (!item) return;
  if (item.stock + delta < 0) {
    notify("Existencia insuficiente para descontar.", "err");
    return;
  }
  item.stock += delta;
  saveDb();
  renderInventory(document.getElementById("content-area"), true);
  notify(item.stock <= item.minStock ? `Alerta: ${item.item} requiere reabastecimiento.` : "Existencia actualizada.");
};

function renderReports(area) {
  const confirmed = db.appointments.filter((a) => a.status === "Confirmada").length;
  const attended = db.appointments.filter((a) => a.status === "Atendida").length;
  const cancelled = db.appointments.filter((a) => a.status === "Cancelada").length;
  const lowItems = db.inventory.filter((i) => i.stock <= i.minStock);

  area.innerHTML = `
    <div class="two-col">
      <div class="card">
        <h3>Consolidado Operativo y Copias de Seguridad</h3>
        <p class="muted">Confirmadas: <strong>${confirmed}</strong> · Atendidas: <strong>${attended}</strong> · Canceladas: <strong>${cancelled}</strong></p>
        <p class="muted">Historias clínicas archivadas: <strong>${db.records.length}</strong></p>
        <div class="row-actions">
          <button type="button" id="export-json-btn" class="btn-primary">Exportar copia de seguridad (.json)</button>
          <label class="btn-outline" style="cursor:pointer; display:inline-block;">
            Cargar respaldo (.json)
            <input type="file" id="import-json-input" accept=".json" class="hidden" />
          </label>
        </div>
      </div>
      <div class="card">
        <h3>Alertas de Reabastecimiento</h3>
        ${lowItems.length === 0
          ? `<p class="pill pill-ok">Niveles de inventario óptimos</p>`
          : `<ul>${lowItems.map((i) => `<li><strong>${i.item}</strong>: ${i.stock} unid. (mínimo ${i.minStock})</li>`).join("")}</ul>`
        }
      </div>
    </div>
  `;

  document.getElementById("export-json-btn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `SanFrancisco_Respaldo_${getLocalDateString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify("Copia de seguridad descargada.");
  });

  document.getElementById("import-json-input").addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!parsed.users || !parsed.pets || !parsed.appointments) {
          throw new Error("Formato inválido");
        }
        db = parsed;
        saveDb();
        renderReports(area);
        notify("Base de datos restaurada desde el respaldo.");
      } catch (_) {
        notify("El archivo seleccionado no es un respaldo válido de novaVet.", "err");
      }
    };
    reader.readAsText(file);
  });
}

// VETERINARIO
function renderAgenda(area) {
  area.innerHTML = `
    <div class="card">
      <h3>Agenda de Consultas Médicas</h3>
      <table>
        <thead><tr><th>Fecha</th><th>Hora</th><th>Paciente</th><th>Propietario</th><th>Motivo</th><th>Estado</th><th>Acciones</th></tr></thead>
        <tbody>
          ${db.appointments.map((a) => `
            <tr>
              <td>${a.date}</td>
              <td>${a.time}</td>
              <td><strong>${getPetName(a.petId)}</strong></td>
              <td>${getOwnerNameByPet(a.petId)}</td>
              <td>${a.reason}</td>
              <td><span class="pill ${getStatusPillClass(a.status)}">${a.status}</span></td>
              <td class="row-actions">
                ${a.status !== "Atendida" && a.status !== "Cancelada"
                  ? `<button type="button" class="btn-secondary" onclick="markAttended(${a.id})">Finalizar consulta</button>`
                  : ""}
                <button type="button" class="btn-outline" onclick="openRecordForPet(${a.petId})">Historia clínica</button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

window.markAttended = function (id) {
  if (currentRole !== "VET") return;
  const appt = db.appointments.find((a) => a.id === id);
  if (!appt) return;
  appt.status = "Atendida";
  saveDb();
  renderAgenda(document.getElementById("content-area"));
  notify(`Consulta de ${getPetName(appt.petId)} finalizada.`);
};

window.openRecordForPet = function (petId) {
  if (currentRole !== "VET") return;
  preselectedPetForRecord = Number(petId);
  activeSection = "records";
  renderMenu();
  renderSection();
};

function renderRecords(area) {
  const selectedId = preselectedPetForRecord || db.pets[0]?.id;
  preselectedPetForRecord = null;

  area.innerHTML = `
    <div class="two-col">
      <div class="card">
        <h3>Evolución Clínica y Fórmula Médica</h3>
        <form id="record-form" class="form-stack">
          <label>Paciente
            <select id="rec-pet">
              ${db.pets.map((p) => `<option value="${p.id}" ${p.id === selectedId ? "selected" : ""}>${p.name} (${p.species} · ${getOwnerNameByPet(p.id)})</option>`).join("")}
            </select>
          </label>
          <label>Anamnesis y diagnóstico <textarea id="rec-diag" rows="2" required></textarea></label>
          <label>Prescripción y tratamiento <textarea id="rec-presc" rows="2" required></textarea></label>
          <button type="submit" class="btn-primary">Archivar en historia clínica</button>
        </form>
      </div>
      <div class="card">
        <h3>Historial Médico Registrado</h3>
        ${db.records.length === 0
          ? `<p class="muted">Sin evoluciones clínicas registradas aún.</p>`
          : db.records.map((r) => `
            <div class="session-badge">
              <strong>${getPetName(r.petId)}</strong> · <span class="muted">${r.date} · ${r.vetName}</span>
              <p><strong>Diagnóstico:</strong> ${r.diagnosis}</p>
              <p><strong>Prescripción:</strong> ${r.prescription}</p>
            </div>
          `).join("")
        }
      </div>
    </div>
  `;

  document.getElementById("record-form").addEventListener("submit", (e) => {
    e.preventDefault();
    db.records.unshift({
      id: Date.now(),
      petId: Number(document.getElementById("rec-pet").value),
      vetName: currentUser.name,
      date: getLocalDateString(),
      diagnosis: document.getElementById("rec-diag").value.trim(),
      prescription: document.getElementById("rec-presc").value.trim()
    });
    saveDb();
    renderRecords(area);
    notify("Historia clínica archivada correctamente.");
  });
}

function renderPatientsWithHistory(area) {
  area.innerHTML = `
    <div class="card">
      <h3>Pacientes y Resumen Clínico</h3>
      <table>
        <thead><tr><th>Paciente</th><th>Especie / Raza</th><th>Propietario</th><th>Evoluciones</th></tr></thead>
        <tbody>
          ${db.pets.map((p) => {
            const count = db.records.filter((r) => r.petId === p.id).length;
            return `
              <tr>
                <td><strong>${p.name}</strong></td>
                <td>${p.species} · ${p.breed} (${p.age})</td>
                <td>${getOwnerNameByPet(p.id)}</td>
                <td>${count} registro(s)</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

// RECEPCIÓN
function renderReceptionFlow(area) {
  const vets = db.users.filter((u) => u.role === "VET" && u.active);
  const vetOptions = vets.length ? vets.map((v) => v.name) : ["Dra. Valentina Ríos"];

  area.innerHTML = `
    <div class="two-col">
      <div class="card">
        <h3>1. Admisión de Propietario y Paciente</h3>
        <form id="owner-pet-form" class="form-stack">
          <label>Nombre completo del propietario <input type="text" id="ow-name" required /></label>
          <label>Teléfono de contacto <input type="text" id="ow-phone" required /></label>
          <label>Dirección de residencia <input type="text" id="ow-address" placeholder="Opcional" /></label>
          <label>Nombre del paciente (mascota) <input type="text" id="pet-name" required /></label>
          <label>Especie
            <select id="pet-species">
              <option value="Canino">Canino</option>
              <option value="Felino">Felino</option>
              <option value="Otro">Otro</option>
            </select>
          </label>
          <label>Raza <input type="text" id="pet-breed" placeholder="Ej. Criollo, French Poodle" required /></label>
          <label>Edad <input type="text" id="pet-age" placeholder="Ej. 2 años" required /></label>
          <button type="submit" class="btn-primary">Guardar ficha de admisión</button>
        </form>
      </div>

      <div class="card">
        <h3>2. Agendamiento de Cita (Control anti-traslape)</h3>
        <form id="appt-form" class="form-stack">
          <label>Paciente y propietario
            <select id="ap-pet">
              ${db.pets.map((p) => `<option value="${p.id}">${p.name} — Prop: ${getOwnerNameByPet(p.id)}</option>`).join("")}
            </select>
          </label>
          <label>Médico veterinario
            <select id="ap-vet">
              ${vetOptions.map((name) => `<option value="${name}">${name}</option>`).join("")}
            </select>
          </label>
          <label>Fecha <input type="date" id="ap-date" min="${getLocalDateString()}" value="${getLocalDateString()}" required /></label>
          <label>Hora <input type="time" id="ap-time" value="11:30" required /></label>
          <label>Motivo de atención <input type="text" id="ap-reason" placeholder="Vacunación, consulta general, control..." required /></label>
          <button type="submit" class="btn-primary">Confirmar cita</button>
        </form>
      </div>
    </div>
  `;

  document.getElementById("owner-pet-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const ownerName = document.getElementById("ow-name").value.trim();
    const existingOwner = db.owners.find((o) => o.name.toLowerCase() === ownerName.toLowerCase());
    const ownerId = existingOwner ? existingOwner.id : Date.now();

    if (!existingOwner) {
      db.owners.push({
        id: ownerId,
        name: ownerName,
        phone: document.getElementById("ow-phone").value.trim(),
        address: document.getElementById("ow-address").value.trim() || "No registrada"
      });
    }

    db.pets.push({
      id: Date.now() + 1,
      ownerId,
      name: document.getElementById("pet-name").value.trim(),
      species: document.getElementById("pet-species").value,
      breed: document.getElementById("pet-breed").value.trim(),
      age: document.getElementById("pet-age").value.trim()
    });

    saveDb();
    renderReceptionFlow(area);
    notify("Ficha de admisión registrada.");
  });

  document.getElementById("appt-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const vetName = document.getElementById("ap-vet").value;
    const date = document.getElementById("ap-date").value;
    const time = document.getElementById("ap-time").value;

    const conflict = db.appointments.some(
      (a) => a.vetName === vetName && a.date === date && a.time === time && a.status !== "Cancelada"
    );
    if (conflict) {
      notify(`Horario ocupado: ${vetName} ya tiene cita el ${date} a las ${time}.`, "err");
      return;
    }

    db.appointments.push({
      id: Date.now(),
      petId: Number(document.getElementById("ap-pet").value),
      vetName,
      date,
      time,
      reason: document.getElementById("ap-reason").value.trim(),
      status: "Confirmada"
    });

    saveDb();
    renderReceptionFlow(area);
    notify("Cita confirmada en agenda.");
  });
}

function renderAppointmentsManage(area) {
  area.innerHTML = `
    <div class="card">
      <h3>Control de Turnos Programados</h3>
      <table>
        <thead><tr><th>Fecha</th><th>Hora</th><th>Paciente</th><th>Veterinario</th><th>Estado</th><th>Acciones</th></tr></thead>
        <tbody>
          ${db.appointments.map((a) => `
            <tr>
              <td>${a.date}</td>
              <td>${a.time}</td>
              <td><strong>${getPetName(a.petId)}</strong></td>
              <td>${a.vetName}</td>
              <td><span class="pill ${getStatusPillClass(a.status)}">${a.status}</span></td>
              <td class="row-actions">
                ${a.status !== "Cancelada" && a.status !== "Atendida" ? `
                  <button type="button" class="btn-outline" onclick="shiftHour(${a.id})">+1h</button>
                  <button type="button" class="btn-outline" onclick="cancelAppt(${a.id})">Cancelar</button>
                ` : "—"}
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

window.shiftHour = function (id) {
  if (currentRole !== "RECEP") return;
  const appt = db.appointments.find((a) => a.id === id);
  if (!appt) return;
  const [hh, mm] = appt.time.split(":").map(Number);
  const nextH = String((hh + 1) % 24).padStart(2, "0");
  const nextTime = `${nextH}:${String(mm).padStart(2, "0")}`;

  const conflict = db.appointments.some(
    (a) => a.id !== id && a.vetName === appt.vetName && a.date === appt.date && a.time === nextTime && a.status !== "Cancelada"
  );
  if (conflict) {
    notify("No se puede reprogramar: ese bloque ya está ocupado.", "err");
    return;
  }
  appt.time = nextTime;
  saveDb();
  renderAppointmentsManage(document.getElementById("content-area"));
  notify(`Turno reprogramado para las ${nextTime}.`);
};

window.cancelAppt = function (id) {
  if (currentRole !== "RECEP") return;
  const appt = db.appointments.find((a) => a.id === id);
  if (!appt) return;
  appt.status = "Cancelada";
  saveDb();
  renderAppointmentsManage(document.getElementById("content-area"));
  notify("Turno cancelado.", "warn");
};

function renderSearch(area) {
  area.innerHTML = `
    <div class="card">
      <h3>Directorio de Pacientes y Propietarios</h3>
      <input type="search" id="quick-search-input" placeholder="Filtrar por paciente, especie, propietario o teléfono..." />
      <div id="search-results"></div>
    </div>
  `;

  const input = document.getElementById("quick-search-input");
  const drawResults = () => {
    const q = input.value.trim().toLowerCase();
    const matches = db.pets.filter((p) => {
      const owner = getOwnerByPet(p.id);
      const ownerName = (owner?.name || "").toLowerCase();
      const ownerPhone = (owner?.phone || "").toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        p.species.toLowerCase().includes(q) ||
        ownerName.includes(q) ||
        ownerPhone.includes(q)
      );
    });

    document.getElementById("search-results").innerHTML = matches.length
      ? `<table>
          <thead><tr><th>Paciente</th><th>Especie / Raza</th><th>Propietario</th><th>Teléfono</th></tr></thead>
          <tbody>
            ${matches.map((p) => {
              const owner = getOwnerByPet(p.id);
              return `
                <tr>
                  <td><strong>${p.name}</strong></td>
                  <td>${p.species} · ${p.breed}</td>
                  <td>${owner?.name || "—"}</td>
                  <td>${owner?.phone || "—"}</td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>`
      : `<p class="muted">No hay registros que coincidan con la búsqueda.</p>`;
  };

  input.addEventListener("input", drawResults);
  drawResults();
}

syncLoginTab("ADMIN");