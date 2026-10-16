/* FleetDesk app UI */

const S = {
  user: null, orgs: [], trucks: [],
  year: "ALL", quarter: "ALL", truckId: "ALL", tab: "dashboard",
  cache: {},
};

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmt$ = n => (n < 0 ? "-" : "") + "$" + Math.abs(n).toFixed(2);
const fmtN = (n, d = 1) => Number(n || 0).toLocaleString(undefined,
  { maximumFractionDigits: d, minimumFractionDigits: d });

/* ---------- init ---------- */

async function init() {
  S.user = await requireUser();
  $("userEmail").textContent = S.user.email;
  $("signOutBtn").onclick = signOut;

  S.orgs = await myOrgs();
  const orgSel = $("orgSelect");
  orgSel.innerHTML = S.orgs.map(o =>
    `<option value="${o.id}">${esc(o.name)} (${o.plan})</option>`).join("");
  if (!activeOrgId() || !S.orgs.some(o => o.id === activeOrgId()))
    setActiveOrgId(S.orgs[0].id);
  orgSel.value = activeOrgId();
  orgSel.onchange = () => { setActiveOrgId(orgSel.value); S.cache = {}; render(); };

  // year options from current year down to 2020
  const y = new Date().getFullYear();
  const years = [];
  for (let i = y; i >= 2020; i--) years.push(i);
  $("yearSelect").innerHTML =
    `<option value="ALL">All years</option>` +
    years.map(v => `<option>${v}</option>`).join("");
  $("yearSelect").onchange = e => { S.year = e.target.value; S.cache = {}; render(); };
  $("quarterSelect").onchange = e => { S.quarter = e.target.value; S.cache = {}; render(); };
  $("truckSelect").onchange = e => { S.truckId = e.target.value; S.cache = {}; render(); };

  document.querySelectorAll("#tabs .tab").forEach(t => {
    t.onclick = () => {
      document.querySelectorAll("#tabs .tab").forEach(x => x.classList.remove("active"));
      t.classList.add("active");
      S.tab = t.dataset.tab;
      render();
    };
  });

  await refreshTrucks();
  render();
}

async function refreshTrucks() {
  S.trucks = await DB.trucks();
  $("truckSelect").innerHTML =
    `<option value="ALL">All trucks</option>` +
    S.trucks.map(t => `<option value="${t.id}">${esc(t.unit_number)}</option>`).join("");
  $("truckSelect").value = S.truckId;
}

function truckName(id) {
  const t = S.trucks.find(t => t.id === id);
  return t ? t.unit_number : "—";
}

async function filteredTrips() {
  const key = `trips:${S.year}:${S.quarter}:${S.truckId}`;
  if (!S.cache[key]) {
    const scoped = S.year !== "ALL" && S.quarter !== "ALL";
    S.cache[key] = await DB.trips(scoped
      ? { year: S.year, quarter: S.quarter, truckId: S.truckId }
      : { truckId: S.truckId });
  }
  return S.cache[key];
}

async function filteredFuel() {
  const key = `fuel:${S.year}:${S.quarter}:${S.truckId}`;
  if (!S.cache[key]) {
    const scoped = S.year !== "ALL" && S.quarter !== "ALL";
    S.cache[key] = await DB.fuel(scoped
      ? { year: S.year, quarter: S.quarter, truckId: S.truckId }
      : { truckId: S.truckId });
  }
  return S.cache[key];
}

/* ---------- render dispatch ---------- */

async function render() {
  const c = $("content");
  try {
    if (S.tab === "dashboard") await renderDashboard(c);
    else if (S.tab === "trips") await renderTrips(c);
    else if (S.tab === "fuel") await renderFuel(c);
    else if (S.tab === "trucks") await renderTrucks(c);
    else if (S.tab === "ifta") await renderIFTA(c);
    else if (S.tab === "filings") await renderFilings(c);
  } catch (e) {
    c.innerHTML = `<div class="card"><p class="error">Error: ${esc(e.message)}</p></div>`;
  }
}

/* ---------- dashboard ---------- */

async function renderDashboard(c) {
  const [trips, fuel] = await Promise.all([filteredTrips(), filteredFuel()]);
  const r = computeIFTA(trips, fuel);
  const states = Object.keys(r.rows).length;
  c.innerHTML = `
    <div class="kpis">
      <div class="kpi"><h3>Total Miles</h3><div class="value">${fmtN(r.totalMiles)}</div>
        <div class="trend">Across ${states} states</div></div>
      <div class="kpi"><h3>Fuel Purchased</h3><div class="value">${fmtN(r.totalGallons)}</div>
        <div class="trend">gallons</div></div>
      <div class="kpi"><h3>Fleet MPG</h3><div class="value">${fmtN(r.mpg, 2)}</div>
        <div class="trend">${r.mpgEstimated ? "estimated" : "from fuel log"}</div></div>
      <div class="kpi"><h3>Trips</h3><div class="value">${trips.length}</div>
        <div class="trend">${S.trucks.length} truck(s) in fleet</div></div>
    </div>
    <div class="card">
      <h2>Miles by State</h2>
      ${stateTable(Object.entries(r.rows).sort((a, b) => b[1].miles - a[1].miles)
        .map(([st, x]) => [st, fmtN(x.miles)]), ["State", "Miles"])}
      ${r.milesEstimated ? `<p class="note warn">⚠ State miles estimated (even route split). Add per-trip State Miles for audit-ready numbers.</p>` : ""}
    </div>`;
}

function stateTable(rows, headers) {
  return `<table><thead><tr>${headers.map((h, i) =>
    `<th${i ? ' class="number"' : ""}>${h}</th>`).join("")}</tr></thead>
    <tbody>${rows.map(([a, b]) =>
      `<tr><td class="route">${esc(a)}</td><td class="number">${b}</td></tr>`).join("")}
    </tbody></table>`;
}

/* ---------- trips ---------- */

function parseStateMilesInput(str) {
  if (!str || !str.trim()) return null;
  const out = {};
  str.split(/[,;]/).forEach(part => {
    const m = part.trim().match(/^([A-Za-z]{2})\s*[:=]?\s*([\d.]+)$/);
    if (m) { const st = cleanState(m[1]); if (st) out[st] = (out[st] || 0) + Number(m[2]); }
  });
  return Object.keys(out).length ? out : null;
}

async function renderTrips(c) {
  const trips = await DB.trips({ truckId: S.truckId });
  const truckOpts = S.trucks.map(t =>
    `<option value="${t.id}">${esc(t.unit_number)}</option>`).join("");
  c.innerHTML = `
    <div class="card">
      <h2>Log a trip</h2>
      <div class="form-grid">
        <div><label>Date</label><input type="date" id="t-date"></div>
        <div><label>Truck</label><select id="t-truck">${truckOpts}</select></div>
        <div><label>Origin</label><input type="text" id="t-origin" placeholder="El Reno, OK"></div>
        <div><label>Destination</label><input type="text" id="t-dest" placeholder="Stockton, CA"></div>
        <div><label>Route (states)</label><input type="text" id="t-route" placeholder="OK, TX, NM, AZ, CA"></div>
        <div><label>Miles</label><input type="number" id="t-miles" step="0.1" min="0"></div>
        <div><label>State miles <span class="note">(optional, e.g. TX:600, OK:300)</span></label>
          <input type="text" id="t-statemiles"></div>
      </div>
      <button id="t-add">Add trip</button>
      <p class="error" id="t-err"></p>
    </div>
    <div class="card">
      <h2>Trips (${trips.length})</h2>
      <table><thead><tr><th>Date</th><th>Truck</th><th>Origin</th><th>Destination</th>
        <th>Route</th><th class="number">Miles</th><th></th></tr></thead>
      <tbody>${trips.slice(0, 200).map(t => `
        <tr><td>${esc(t.date)}</td><td>${esc(truckName(t.truck_id))}</td>
          <td>${esc(t.origin)}</td><td>${esc(t.destination)}</td>
          <td class="route">${esc(t.route)}</td>
          <td class="number">${fmtN(Number(t.mileage))}</td>
          <td class="number"><button class="small danger" data-del-trip="${t.id}">✕</button></td>
        </tr>`).join("")}</tbody></table>
    </div>`;

  $("t-add").onclick = async () => {
    try {
      const sm = parseStateMilesInput($("t-statemiles").value);
      await DB.addTrip({
        date: $("t-date").value,
        truck_id: $("t-truck").value || null,
        origin: $("t-origin").value.trim(),
        destination: $("t-dest").value.trim(),
        route: $("t-route").value.trim(),
        mileage: Number($("t-miles").value) || 0,
        state_miles: sm,
      });
      S.cache = {}; render();
    } catch (e) { $("t-err").textContent = e.message; }
  };
  c.querySelectorAll("[data-del-trip]").forEach(b => b.onclick = async () => {
    if (confirm("Delete this trip?")) { await DB.deleteTrip(b.dataset.delTrip); S.cache = {}; render(); }
  });
}

/* ---------- fuel ---------- */

async function renderFuel(c) {
  const fuel = await DB.fuel({ truckId: S.truckId });
  const truckOpts = S.trucks.map(t =>
    `<option value="${t.id}">${esc(t.unit_number)}</option>`).join("");
  const total = fuel.reduce((a, f) => a + Number(f.gallons), 0);
  c.innerHTML = `
    <div class="card">
      <h2>Log fuel purchase</h2>
      <div class="form-grid">
        <div><label>Date</label><input type="date" id="f-date"></div>
        <div><label>Truck</label><select id="f-truck">${truckOpts}</select></div>
        <div><label>State</label><input type="text" id="f-state" maxlength="2" placeholder="TX"></div>
        <div><label>Gallons</label><input type="number" id="f-gal" step="0.01" min="0"></div>
        <div><label>Price/gal (optional)</label><input type="number" id="f-price" step="0.001" min="0"></div>
      </div>
      <button id="f-add">Add purchase</button>
      <p class="error" id="f-err"></p>
    </div>
    <div class="card">
      <h2>Fuel purchases (${fuel.length} — ${fmtN(total)} gal)</h2>
      <table><thead><tr><th>Date</th><th>Truck</th><th>State</th>
        <th class="number">Gallons</th><th class="number">$/gal</th><th></th></tr></thead>
      <tbody>${fuel.slice(0, 200).map(f => `
        <tr><td>${esc(f.date)}</td><td>${esc(truckName(f.truck_id))}</td>
          <td class="route">${esc(f.state)}</td>
          <td class="number">${fmtN(Number(f.gallons), 2)}</td>
          <td class="number">${f.price_per_gallon ? "$" + Number(f.price_per_gallon).toFixed(3) : "—"}</td>
          <td class="number"><button class="small danger" data-del-fuel="${f.id}">✕</button></td>
        </tr>`).join("")}</tbody></table>
    </div>`;

  $("f-add").onclick = async () => {
    try {
      const st = cleanState($("f-state").value);
      if (!st) throw new Error("Enter a 2-letter state code.");
      await DB.addFuel({
        date: $("f-date").value,
        truck_id: $("f-truck").value || null,
        state: st,
        gallons: Number($("f-gal").value),
        price_per_gallon: $("f-price").value ? Number($("f-price").value) : null,
      });
      S.cache = {}; render();
    } catch (e) { $("f-err").textContent = e.message; }
  };
  c.querySelectorAll("[data-del-fuel]").forEach(b => b.onclick = async () => {
    if (confirm("Delete this purchase?")) { await DB.deleteFuel(b.dataset.delFuel); S.cache = {}; render(); }
  });
}

/* ---------- trucks ---------- */

async function renderTrucks(c) {
  await refreshTrucks();
  c.innerHTML = `
    <div class="card">
      <h2>Add truck</h2>
      <div class="form-grid">
        <div><label>Unit number</label><input type="text" id="k-unit" placeholder="567"></div>
        <div><label>Year</label><input type="number" id="k-year" placeholder="2026"></div>
        <div><label>Make</label><input type="text" id="k-make" placeholder="Peterbilt"></div>
        <div><label>Model</label><input type="text" id="k-model" placeholder="567"></div>
        <div><label>VIN</label><input type="text" id="k-vin"></div>
      </div>
      <button id="k-add">Add truck</button>
      <p class="error" id="k-err"></p>
    </div>
    <div class="card">
      <h2>Fleet (${S.trucks.length})</h2>
      <table><thead><tr><th>Unit</th><th>Year</th><th>Make</th><th>Model</th><th>VIN</th><th></th></tr></thead>
      <tbody>${S.trucks.map(t => `
        <tr><td class="route">${esc(t.unit_number)}</td><td>${esc(t.year)}</td>
          <td>${esc(t.make)}</td><td>${esc(t.model)}</td><td>${esc(t.vin)}</td>
          <td class="number"><button class="small danger" data-del-truck="${t.id}">✕</button></td>
        </tr>`).join("")}</tbody></table>
    </div>`;

  $("k-add").onclick = async () => {
    try {
      await DB.addTruck({
        unit_number: $("k-unit").value.trim(),
        year: $("k-year").value ? Number($("k-year").value) : null,
        make: $("k-make").value.trim() || null,
        model: $("k-model").value.trim() || null,
        vin: $("k-vin").value.trim() || null,
      });
      S.cache = {}; await refreshTrucks(); render();
    } catch (e) { $("k-err").textContent = e.message; }
  };
  c.querySelectorAll("[data-del-truck]").forEach(b => b.onclick = async () => {
    if (confirm("Delete this truck? Its trips/fuel stay but become unassigned.")) {
      await DB.deleteTruck(b.dataset.delTruck); S.cache = {}; render();
    }
  });
}

/* ---------- IFTA calculator ---------- */

let mpgOverrideVal = "";

async function renderIFTA(c) {
  const needQ = S.year === "ALL" || S.quarter === "ALL";
  const [trips, fuel] = await Promise.all([filteredTrips(), filteredFuel()]);
  const rateInfo = needQ ? null : iftaRatesFor(S.year, S.quarter);
  const mpgOv = mpgOverrideVal ? Number(mpgOverrideVal) : null;

  let result = computeIFTA(trips, fuel, mpgOv);
  if (rateInfo) result = applyIFTARates(result, rateInfo);
  const t = result.totals;

  const flags = [];
  if (result.milesEstimated)
    flags.push("⚠ State miles are estimated (even route split). Add per-trip State Miles for audit-ready numbers.");
  if (result.mpgEstimated && !mpgOv)
    flags.push("⚠ MPG is estimated at 6.5 — log fuel or type your MPG.");
  if (rateInfo && rateInfo.holidays.length)
    rateInfo.holidays.forEach(h => flags.push("⚠ " + esc(h)));

  let table;
  if (rateInfo) {
    const rows = Object.entries(result.rows).sort((a, b) => b[1].net - a[1].net);
    table = `<table><thead><tr>
      <th>State</th><th class="number">Miles</th><th class="number">Taxable Gal</th>
      <th class="number">Rate</th><th class="number">Tax Due</th><th class="number">Surcharge</th>
      <th class="number">Gal Bought</th><th class="number">Credit</th><th class="number">Net</th>
      </tr></thead><tbody>${rows.map(([st, r]) => `
      <tr><td class="route">${st}</td>
        <td class="number">${fmtN(r.miles)}</td>
        <td class="number">${fmtN(r.taxableGal)}</td>
        <td class="number">${r.rate === null ? "n/a" : "$" + r.rate.toFixed(4)}</td>
        <td class="number">${r.taxDue === null ? "n/a" : fmt$(r.taxDue)}</td>
        <td class="number">${r.surcharge > 0 ? fmt$(r.surcharge) : "—"}</td>
        <td class="number">${fmtN(r.boughtGal)}</td>
        <td class="number">${fmt$(r.credit)}</td>
        <td class="number" style="font-weight:700;color:${r.net === 0 ? "var(--text)" : r.net > 0 ? "var(--danger)" : "var(--success)"}">
          ${r.net >= 0 ? fmt$(r.net) : "($" + Math.abs(r.net).toFixed(2) + ")"}</td>
      </tr>`).join("")}</tbody>
      <tfoot><tr style="font-weight:700">
        <td>Total</td><td class="number">${fmtN(result.totalMiles)}</td>
        <td class="number">${fmtN(Object.values(result.rows).reduce((a, r) => a + r.taxableGal, 0))}</td>
        <td></td><td class="number">${fmt$(t.taxDue)}</td>
        <td class="number">${t.surcharge > 0 ? fmt$(t.surcharge) : "—"}</td>
        <td class="number">${fmtN(result.totalGallons)}</td>
        <td class="number">${fmt$(t.credit)}</td>
        <td class="number">${t.net >= 0 ? fmt$(t.net) : "($" + Math.abs(t.net).toFixed(2) + ")"}</td>
      </tr></tfoot></table>`;
  } else {
    table = `<p class="note">Select a single year and quarter above to run the tax calculation. Rates are loaded for all four 2026 quarters.</p>`;
  }

  c.innerHTML = `
    <div class="card">
      <h2>🧾 IFTA Tax Calculator</h2>
      <div class="kpis">
        <div class="kpi"><h3>Fleet MPG ${result.mpgEstimated ? "(estimated)" : "(from fuel)"}</h3>
          <div class="value">${fmtN(result.mpg, 2)}</div>
          <div class="trend">Override: <input type="number" id="mpgOv" step="0.1" min="1" max="15"
            value="${esc(mpgOverrideVal)}" placeholder="${fmtN(result.mpg, 2)}"
            style="width:80px;background:var(--panel-soft);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:4px 8px"></div></div>
        <div class="kpi"><h3>Quarter Net</h3>
          <div class="value" style="color:${!t ? "var(--text)" : t.net > 0 ? "var(--danger)" : "var(--success)"}">
            ${!t ? "—" : (t.net >= 0 ? "Owe " + fmt$(t.net) : "Credit " + fmt$(Math.abs(t.net)))}</div>
          <div class="trend">${rateInfo && rateInfo.deadline ? "File by " + rateInfo.deadline : ""}</div></div>
        <div class="kpi"><h3>Fuel Logged</h3><div class="value">${fmtN(result.totalGallons)}</div>
          <div class="trend">gallons this period</div></div>
      </div>
      ${flags.length ? `<div class="note" style="margin-bottom:12px">${flags.join("<br>")}</div>` : ""}
      ${table}
      ${rateInfo ? `<div style="margin-top:16px">
        <button id="saveFiling">💾 Save ${S.year} ${S.quarter} filing snapshot</button>
        <span class="note" style="margin-left:10px">Freezes these numbers as your audit record.</span>
      </div>` : ""}
    </div>`;

  const ov = $("mpgOv");
  if (ov) ov.onchange = () => { mpgOverrideVal = ov.value; render(); };
  const sv = $("saveFiling");
  if (sv) sv.onclick = async () => {
    try {
      await DB.saveFiling({
        year: Number(S.year), quarter: S.quarter, mpg: result.mpg,
        totals: result.totals, rows: result.rows, status: "draft",
      });
      alert("Filing snapshot saved.");
    } catch (e) { alert("Save failed: " + e.message); }
  };
}

/* ---------- filings ---------- */

async function renderFilings(c) {
  const filings = await DB.filings(S.year);
  c.innerHTML = `
    <div class="card">
      <h2>Quarterly filings</h2>
      ${filings.length ? `<table><thead><tr><th>Quarter</th><th class="number">MPG</th>
        <th class="number">Net</th><th>Status</th><th>Saved</th><th></th></tr></thead>
        <tbody>${filings.map(f => `
        <tr><td class="route">${f.year} ${f.quarter}</td>
          <td class="number">${fmtN(Number(f.mpg), 2)}</td>
          <td class="number" style="color:${f.totals.net > 0 ? "var(--danger)" : "var(--success)"}">
            ${f.totals.net >= 0 ? fmt$(f.totals.net) : "($" + Math.abs(f.totals.net).toFixed(2) + ")"}</td>
          <td>${f.status === "filed" ? "✅ filed" : "📝 draft"}</td>
          <td>${new Date(f.created_at).toLocaleDateString()}</td>
          <td class="number">${f.status === "filed" ? "" :
            `<button class="small" data-filed="${f.id}">Mark filed</button>`}</td>
        </tr>`).join("")}</tbody></table>`
        : `<p class="note">No filings yet. Run the IFTA calculator for a quarter and save a snapshot.</p>`}
    </div>`;
  c.querySelectorAll("[data-filed]").forEach(b => b.onclick = async () => {
    if (confirm("Mark this quarter as filed with your base jurisdiction?")) {
      await DB.markFiled(b.dataset.filed); render();
    }
  });
}

init();
