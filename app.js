const LEGACY_STORAGE_KEY = "novavet_san_francisco_prod_v2";
const TOKEN_STORAGE_KEY = "novavet_auth_token";

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

let db = {
  users: [],
  owners: [],
  pets: [],
  appointments: [],
  records: [],
  inventory: []
};
let defaultEmails = {
  ADMIN: "admin@sanfrancisco.vet",
  VET: "vet@sanfrancisco.vet",
  RECEP: "recepcion@sanfrancisco.vet"
};
let authToken = sessionStorage.getItem(TOKEN_STORAGE_KEY) || "";
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

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function setAuthToken(token) {
  authToken = token || "";
  if (authToken) {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, authToken);
  } else {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

async function apiRequest(path, options = {}) {
  if (window.location.protocol === "file:") {
    throw new Error("Abre novaVet desde el servidor local (ejecuta iniciar_novavet.bat o python server.py y entra a http://127.0.0.1:8000).");
  }

  const headers = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    ...(options.headers || {})
  };

  const response = await fetch(path, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && currentUser) {
      logoutLocal();
    }
    throw new Error(data.error || `Error del servidor (${response.status}).`);
  }
  return data;
}

function notify(message, type = "ok") {
  const loginVisible = !document.getElementById("login-view").classList.contains("hidden");
  const banner = document.getElementById(loginVisible ? "login-alert" : "alert-banner");
  if (!banner) return;
  banner.textContent = message;
  banner.className = `alert-banner ${type}`;
  clearTimeout(notify._timer);
  notify._timer = setTimeout(() => {
    banner.className = "alert-banner hidden";
  }, 5000);
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
    `Sección seleccionada: <strong>${escapeHtml(ROLE_LABELS[role])}</strong>. Solo puede ingresar personal con este rol y su contraseña.`;
  document.getElementById("login-email").value = defaultEmails[role] || "";
  document.getElementById("login-password").value = "";
}

document.querySelectorAll("#role-tabs .nv-role-card").forEach((btn) => {
  btn.addEventListener("click", () => syncLoginTab(btn.dataset.role));
});

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("login-email").value.trim().toLowerCase();
  const password = document.getElementById("login-password").value;

  try {
    const result = await apiRequest("/api/auth/login", {
      method: "POST",
      body: { email, password, role: selectedLoginRole }
    });
    setAuthToken(result.token);
    db = result.state;
    enterSystem(result.user);
  } catch (err) {
    notify(err.message, "err");
  }
});

function enterSystem(user) {
  currentRole = user.role;
  currentUser = user;
  activeSection = ROLE_MENUS[currentRole][0].id;

  for (const id of ["alert-banner", "login-alert"]) {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = "";
      el.className = "alert-banner hidden";
    }
  }
  clearTimeout(notify._timer);

  document.getElementById("login-view").classList.add("hidden");
  document.getElementById("app-shell").classList.remove("hidden");
  document.getElementById("active-role-tag").textContent = `● ${ROLE_LABELS[currentRole]}`;
  document.getElementById("session-user").innerHTML =
    `<strong>${escapeHtml(user.name)}</strong><br><span class="muted">${escapeHtml(ROLE_LABELS[currentRole])}</span>`;

  renderMenu();
  renderSection();
}

function logoutLocal() {
  setAuthToken("");
  currentRole = null;
  currentUser = null;
  activeSection = null;
  document.getElementById("app-shell").classList.add("hidden");
  document.getElementById("login-view").classList.remove("hidden");
  syncLoginTab(selectedLoginRole);
}

const logoutButton = document.getElementById("logout-btn");
if (logoutButton) {
  logoutButton.addEventListener("click", async () => {
    try {
      if (authToken) {
        await apiRequest("/api/auth/logout", { method: "POST" });
      }
    } catch (_) {
      // Ignorar errores de red al cerrar sesión localmente
    } finally {
      logoutLocal();
    }
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
              <td>${escapeHtml(a.date)}</td>
              <td>${escapeHtml(a.time)}</td>
              <td><strong>${escapeHtml(getPetName(a.petId))}</strong></td>
              <td>${escapeHtml(getOwnerNameByPet(a.petId))}</td>
              <td>${escapeHtml(a.vetName)}</td>
              <td><span class="pill ${getStatusPillClass(a.status)}">${escapeHtml(a.status)}</span></td>
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
                <td><strong>${escapeHtml(u.name)}</strong><br><span class="muted">${escapeHtml(u.email)}</span></td>
                <td>${escapeHtml(ROLE_LABELS[u.role])}</td>
                <td><span class="pill ${u.active ? "pill-ok" : "pill-err"}">${u.active ? "Activo" : "Suspendido"}</span></td>
                <td><button type="button" class="btn-outline" onclick="toggleUser(${u.id})">${u.active ? "Suspender" : "Habilitar"}</button></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById("user-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const result = await apiRequest("/api/users", {
        method: "POST",
        body: {
          name: document.getElementById("u-name").value.trim(),
          email: document.getElementById("u-email").value.trim().toLowerCase(),
          password: document.getElementById("u-pass").value,
          role: document.getElementById("u-role").value
        }
      });
      db = result.state;
      renderUsers(area);
      notify("Usuario y contraseña guardados en la base de datos.");
    } catch (err) {
      notify(err.message, "err");
    }
  });
}

window.toggleUser = async function (id) {
  if (currentRole !== "ADMIN") return;
  try {
    const result = await apiRequest(`/api/users/${id}/toggle`, {
      method: "PATCH",
      body: {}
    });
    db = result.state;
    renderUsers(document.getElementById("content-area"));
    notify(`Estado de ${result.userName} actualizado.`);
  } catch (err) {
    notify(err.message, "err");
  }
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
                  <td><strong>${escapeHtml(item.item)}</strong></td>
                  <td>${escapeHtml(item.category)}</td>
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
    document.getElementById("inv-add-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        const result = await apiRequest("/api/inventory", {
          method: "POST",
          body: {
            item: document.getElementById("inv-name").value.trim(),
            category: document.getElementById("inv-cat").value,
            stock: Number(document.getElementById("inv-stock").value),
            minStock: Number(document.getElementById("inv-min").value)
          }
        });
        db = result.state;
        renderInventory(area, true);
        notify("Producto incorporado al inventario.");
      } catch (err) {
        notify(err.message, "err");
      }
    });
  }
}

window.adjustStock = async function (id, delta) {
  if (currentRole !== "ADMIN") return;
  try {
    const result = await apiRequest(`/api/inventory/${id}/adjust`, {
      method: "PATCH",
      body: { delta }
    });
    db = result.state;
    renderInventory(document.getElementById("content-area"), true);
    notify(result.lowStock ? `Alerta: ${result.item} requiere reabastecimiento.` : "Existencia actualizada.");
  } catch (err) {
    notify(err.message, "err");
  }
};

function renderReports(area) {
  const confirmed = db.appointments.filter((a) => a.status === "Confirmada").length;
  const attended = db.appointments.filter((a) => a.status === "Atendida").length;
  const cancelled = db.appointments.filter((a) => a.status === "Cancelada").length;
  const lowItems = db.inventory.filter((i) => i.stock <= i.minStock);
  const legacySaved = localStorage.getItem(LEGACY_STORAGE_KEY);

  area.innerHTML = `
    <div class="two-col">
      <div class="card">
        <h3>Consolidado Operativo y Copias de Seguridad</h3>
        <p class="muted">Motor activo: <strong>SQLite (novavet.db)</strong></p>
        <p class="muted">Confirmadas: <strong>${confirmed}</strong> · Atendidas: <strong>${attended}</strong> · Canceladas: <strong>${cancelled}</strong></p>
        <p class="muted">Historias clínicas archivadas: <strong>${db.records.length}</strong></p>
        <div class="row-actions">
          <button type="button" id="export-json-btn" class="btn-primary">Exportar copia de seguridad (.json)</button>
          <label class="btn-outline" style="cursor:pointer; display:inline-block;">
            Cargar respaldo (.json)
            <input type="file" id="import-json-input" accept=".json" class="hidden" />
          </label>
          ${legacySaved ? `<button type="button" id="migrate-legacy-btn" class="btn-secondary">Migrar datos previos del navegador</button>` : ""}
        </div>
      </div>
      <div class="card">
        <h3>Alertas de Reabastecimiento</h3>
        ${lowItems.length === 0
          ? `<p class="pill pill-ok">Niveles de inventario óptimos</p>`
          : `<ul>${lowItems.map((i) => `<li><strong>${escapeHtml(i.item)}</strong>: ${i.stock} unid. (mínimo ${i.minStock})</li>`).join("")}</ul>`
        }
      </div>
    </div>
  `;

  document.getElementById("export-json-btn").addEventListener("click", async () => {
    try {
      const backup = await apiRequest("/api/backup/export");
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `SanFrancisco_Respaldo_${getLocalDateString()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      notify("Copia de seguridad descargada desde SQLite.");
    } catch (err) {
      notify(err.message, "err");
    }
  });

  document.getElementById("import-json-input").addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const result = await apiRequest("/api/backup/import", {
          method: "POST",
          body: parsed
        });
        setAuthToken(result.token);
        currentUser = result.user;
        currentRole = result.user.role;
        db = result.state;
        renderReports(area);
        notify("Base de datos SQLite restaurada desde el respaldo.");
      } catch (err) {
        notify(err.message || "El archivo seleccionado no es un respaldo válido de novaVet.", "err");
      }
    };
    reader.readAsText(file);
  });

  const migrateBtn = document.getElementById("migrate-legacy-btn");
  if (migrateBtn) {
    migrateBtn.addEventListener("click", async () => {
      try {
        const parsed = JSON.parse(legacySaved);
        const result = await apiRequest("/api/backup/import", {
          method: "POST",
          body: parsed
        });
        setAuthToken(result.token);
        currentUser = result.user;
        currentRole = result.user.role;
        db = result.state;
        localStorage.removeItem(LEGACY_STORAGE_KEY);
        renderReports(area);
        notify("Datos previos del navegador migrados a SQLite.");
      } catch (err) {
        notify(err.message || "No se pudieron migrar los datos previos.", "err");
      }
    });
  }
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
              <td>${escapeHtml(a.date)}</td>
              <td>${escapeHtml(a.time)}</td>
              <td><strong>${escapeHtml(getPetName(a.petId))}</strong></td>
              <td>${escapeHtml(getOwnerNameByPet(a.petId))}</td>
              <td>${escapeHtml(a.reason)}</td>
              <td><span class="pill ${getStatusPillClass(a.status)}">${escapeHtml(a.status)}</span></td>
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

window.markAttended = async function (id) {
  if (currentRole !== "VET") return;
  try {
    const result = await apiRequest(`/api/appointments/${id}/attend`, {
      method: "PATCH",
      body: {}
    });
    db = result.state;
    renderAgenda(document.getElementById("content-area"));
    notify(`Consulta de ${getPetName(result.petId)} finalizada.`);
  } catch (err) {
    notify(err.message, "err");
  }
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
              ${db.pets.map((p) => `<option value="${p.id}" ${p.id === selectedId ? "selected" : ""}>${escapeHtml(p.name)} (${escapeHtml(p.species)} · ${escapeHtml(getOwnerNameByPet(p.id))})</option>`).join("")}
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
              <strong>${escapeHtml(getPetName(r.petId))}</strong> · <span class="muted">${escapeHtml(r.date)} · ${escapeHtml(r.vetName)}</span>
              <p><strong>Diagnóstico:</strong> ${escapeHtml(r.diagnosis)}</p>
              <p><strong>Prescripción:</strong> ${escapeHtml(r.prescription)}</p>
            </div>
          `).join("")
        }
      </div>
    </div>
  `;

  document.getElementById("record-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const result = await apiRequest("/api/records", {
        method: "POST",
        body: {
          petId: Number(document.getElementById("rec-pet").value),
          date: getLocalDateString(),
          diagnosis: document.getElementById("rec-diag").value.trim(),
          prescription: document.getElementById("rec-presc").value.trim()
        }
      });
      db = result.state;
      renderRecords(area);
      notify("Historia clínica archivada en la base de datos.");
    } catch (err) {
      notify(err.message, "err");
    }
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
                <td><strong>${escapeHtml(p.name)}</strong></td>
                <td>${escapeHtml(p.species)} · ${escapeHtml(p.breed)} (${escapeHtml(p.age)})</td>
                <td>${escapeHtml(getOwnerNameByPet(p.id))}</td>
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
              ${db.pets.map((p) => `<option value="${p.id}">${escapeHtml(p.name)} — Prop: ${escapeHtml(getOwnerNameByPet(p.id))}</option>`).join("")}
            </select>
          </label>
          <label>Médico veterinario
            <select id="ap-vet">
              ${vetOptions.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}
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

  document.getElementById("owner-pet-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const result = await apiRequest("/api/admissions", {
        method: "POST",
        body: {
          ownerName: document.getElementById("ow-name").value.trim(),
          phone: document.getElementById("ow-phone").value.trim(),
          address: document.getElementById("ow-address").value.trim() || "No registrada",
          petName: document.getElementById("pet-name").value.trim(),
          species: document.getElementById("pet-species").value,
          breed: document.getElementById("pet-breed").value.trim(),
          age: document.getElementById("pet-age").value.trim()
        }
      });
      db = result.state;
      renderReceptionFlow(area);
      notify("Ficha de admisión guardada en la base de datos.");
    } catch (err) {
      notify(err.message, "err");
    }
  });

  document.getElementById("appt-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const result = await apiRequest("/api/appointments", {
        method: "POST",
        body: {
          petId: Number(document.getElementById("ap-pet").value),
          vetName: document.getElementById("ap-vet").value,
          date: document.getElementById("ap-date").value,
          time: document.getElementById("ap-time").value,
          reason: document.getElementById("ap-reason").value.trim()
        }
      });
      db = result.state;
      renderReceptionFlow(area);
      notify("Cita confirmada en agenda.");
    } catch (err) {
      notify(err.message, "err");
    }
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
              <td>${escapeHtml(a.date)}</td>
              <td>${escapeHtml(a.time)}</td>
              <td><strong>${escapeHtml(getPetName(a.petId))}</strong></td>
              <td>${escapeHtml(a.vetName)}</td>
              <td><span class="pill ${getStatusPillClass(a.status)}">${escapeHtml(a.status)}</span></td>
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

window.shiftHour = async function (id) {
  if (currentRole !== "RECEP") return;
  try {
    const result = await apiRequest(`/api/appointments/${id}/shift`, {
      method: "PATCH",
      body: {}
    });
    db = result.state;
    renderAppointmentsManage(document.getElementById("content-area"));
    notify(`Turno reprogramado para las ${result.nextTime}.`);
  } catch (err) {
    notify(err.message, "err");
  }
};

window.cancelAppt = async function (id) {
  if (currentRole !== "RECEP") return;
  try {
    const result = await apiRequest(`/api/appointments/${id}/cancel`, {
      method: "PATCH",
      body: {}
    });
    db = result.state;
    renderAppointmentsManage(document.getElementById("content-area"));
    notify("Turno cancelado.", "warn");
  } catch (err) {
    notify(err.message, "err");
  }
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
                  <td><strong>${escapeHtml(p.name)}</strong></td>
                  <td>${escapeHtml(p.species)} · ${escapeHtml(p.breed)}</td>
                  <td>${escapeHtml(owner?.name || "—")}</td>
                  <td>${escapeHtml(owner?.phone || "—")}</td>
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

async function bootstrap() {
  syncLoginTab("ADMIN");

  if (window.location.protocol === "file:") {
    notify("Para usar la base de datos SQLite, abre novaVet desde http://127.0.0.1:8000 ejecutando iniciar_novavet.bat o python server.py.", "warn");
    return;
  }

  try {
    const res = await apiRequest("/api/auth/defaults");
    if (res.defaults) {
      defaultEmails = { ...defaultEmails, ...res.defaults };
      syncLoginTab(selectedLoginRole);
    }
  } catch (err) {
    notify(`No se pudo conectar con el servidor SQLite: ${err.message}`, "err");
    return;
  }

  if (authToken) {
    try {
      const [me, state] = await Promise.all([
        apiRequest("/api/auth/me"),
        apiRequest("/api/state")
      ]);
      db = state;
      enterSystem(me.user);
    } catch (_) {
      setAuthToken("");
    }
  }
}

bootstrap();
