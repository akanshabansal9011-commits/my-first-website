/* Server-driven worksheet catalogue. */
const WorksheetData = (() => {
  const apiUrl = window.WorksheetConfig?.apiUrl?.replace(/\/$/, "") || "";
  const request = async params => {
    if (!apiUrl) throw new Error("Worksheet API is not configured");
    const url = new URL(apiUrl);
    Object.entries(params).forEach(([key, value]) => {
      if (value) url.searchParams.set(key, value);
    });
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Worksheet API returned ${response.status}`);
    return response.json();
  };
  return { request };
})();

const WorksheetUI = (() => {
  const PAGE_SIZE = 9;
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
  const favorites = () => JSON.parse(localStorage.getItem("aaw-favorites") || "[]");
  const state = { page: 1, className: "", subject: "", level: "", sort: "newest" };

  function pdfUrl(w) {
    if (w.pdfUrl || w.downloadUrl) return w.pdfUrl || w.downloadUrl;
    if (w.driveId) return `https://drive.google.com/file/d/${encodeURIComponent(w.driveId)}/view`;
    return "#";
  }

  function card(w) {
    const saved = favorites().includes(String(w.id));
    const pdf = pdfUrl(w);
    return `<article class="worksheet-card fade-in">
      <div class="worksheet-thumb">
        <div class="badges">${w.isNew ? '<span class="badge badge-new">NEW</span>' : ""}${w.isFree !== false ? '<span class="badge badge-free">FREE</span>' : ""}<span class="badge badge-print"><i class="bi bi-printer"></i></span></div>
        <button class="card-favorite ${saved ? "active" : ""}" data-favorite="${esc(w.id)}" data-title="${esc(w.title)}" aria-label="${saved ? "Remove" : "Add"} ${esc(w.title)} ${saved ? "from" : "to"} favorites"><i class="bi bi-heart${saved ? "-fill" : ""}"></i></button>
        <img src="${esc(w.thumbnailUrl || w.thumbnail || "images/worksheet-cover.svg")}" loading="lazy" alt="${esc(w.title)} worksheet cover" onerror="this.src='images/worksheet-cover.svg'">
      </div>
      <div class="worksheet-body">
        <div class="worksheet-meta">${esc(w.subject)} &middot; ${esc(w.className || w.class)}${w.topic ? ` &middot; ${esc(w.topic)}` : ""}</div>
        <h3>${esc(w.title)}</h3>
        <p class="worksheet-desc">${esc(w.description)}</p>
        <div class="tag-row"><span class="tag">${esc(w.className || w.class)}</span><span class="tag">${esc(w.level || w.difficulty)}</span></div>
        <div class="card-actions">
          <a class="btn btn-preview" href="${esc(pdf)}" target="_blank" rel="noopener"><i class="bi bi-eye"></i> Preview</a>
          <a class="btn btn-primary" href="${esc(pdf)}" target="_blank" rel="noopener"><i class="bi bi-download"></i> Download</a>
        </div>
      </div>
    </article>`;
  }

  function bindCards() {
    document.querySelectorAll("[data-favorite]").forEach(button => {
      button.onclick = () => {
        const id = String(button.dataset.favorite);
        let saved = favorites();
        saved = saved.includes(id) ? saved.filter(value => value !== id) : [...saved, id];
        localStorage.setItem("aaw-favorites", JSON.stringify(saved));
        const active = saved.includes(id);
        button.classList.toggle("active", active);
        button.setAttribute("aria-label", `${active ? "Remove" : "Add"} ${button.dataset.title} ${active ? "from" : "to"} favorites`);
        button.innerHTML = `<i class="bi bi-heart${active ? "-fill" : ""}"></i>`;
      };
    });
  }

  function readUrl() {
    const query = new URLSearchParams(location.search);
    state.page = Math.max(1, Number(query.get("page")) || 1);
    state.className = query.get("class") || "";
    state.subject = query.get("subject") || document.body.dataset.subject || "";
    state.level = query.get("level") || "";
    state.sort = query.get("sort") === "alphabetical" ? "alphabetical" : "newest";
  }

  function writeUrl() {
    const url = new URL(location.href);
    [["page", state.page], ["class", state.className], ["subject", state.subject], ["level", state.level], ["sort", state.sort]].forEach(([key, value]) => {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    });
    history.replaceState({}, "", url);
  }

  function addOptions(select, values) {
    if (!select) return;
    const optionKey = value => select.id === "class-filter" ? comparableClass(value) : String(value);
    const seen = new Set([...select.options].map(option => optionKey(option.value)));
    values.filter(Boolean).sort((a, b) => a.localeCompare(b)).forEach(value => {
      const key = optionKey(value);
      if (seen.has(key)) return;
      seen.add(key);
      const label = filterLabel(select, value);
      select.insertAdjacentHTML("beforeend", `<option value="${esc(value)}">${esc(label)}</option>`);
    });
  }

  function filterLabel(select, value) {
    if (select.id === "class-filter") return value.replace(/^Grade\s*(\d+)$/i, "Class $1");
    if (select.id === "subject-filter" && value === "Math") return "Maths";
    return value;
  }

  function syncFilterControl(select, value) {
    if (!select) return;
    select.value = [...select.options].some(option => option.value === value) ? value : "";
  }

  function comparableClass(value) {
    const normalized = String(value || "").trim().toLocaleLowerCase().replace(/\s+/g, "");
    const classNumber = normalized.match(/^(class|grade)(\d+)$/)?.[2];
    return classNumber ? `class-${classNumber}` : normalized;
  }

  function resolveClassFilterValue(value) {
    const classFilter = document.getElementById("class-filter");
    if (!value || !classFilter) return value;
    const comparableValue = comparableClass(value);
    return [...classFilter.options].find(option => comparableClass(option.value) === comparableValue)?.value || value;
  }

  async function fillOptions() {
    const classFilter = document.getElementById("class-filter");
    const subjectFilter = document.getElementById("subject-filter");
    const levelFilter = document.getElementById("level-filter");
    const facets = await WorksheetData.request({ facets: "true" });
    addOptions(classFilter, facets.classes || []);
    addOptions(subjectFilter, facets.subjects || []);
    addOptions(levelFilter, facets.levels || []);
  }

  function pageSet(current, total) {
    return [...new Set([1, total, current - 1, current, current + 1])].filter(n => n >= 1 && n <= total).sort((a, b) => a - b);
  }

  function pagination(p) {
    const nav = document.getElementById("pagination");
    if (p.totalPages <= 1) {
      nav.innerHTML = "";
      return;
    }
    let last = 0;
    const html = [`<button class="page-button" data-page="${p.page - 1}" ${p.page === 1 ? "disabled" : ""}>Previous</button>`];
    pageSet(p.page, p.totalPages).forEach(page => {
      if (page - last > 1) html.push('<span class="page-ellipsis">...</span>');
      html.push(`<button class="page-button ${page === p.page ? "active" : ""}" data-page="${page}" ${page === p.page ? 'aria-current="page"' : ""}>${page}</button>`);
      last = page;
    });
    html.push(`<button class="page-button" data-page="${p.page + 1}" ${p.page === p.totalPages ? "disabled" : ""}>Next</button>`);
    nav.innerHTML = html.join("");
    nav.querySelectorAll("[data-page]").forEach(button => button.onclick = () => changePage(Number(button.dataset.page)));
  }

  function render(result) {
    const grid = document.getElementById("worksheets-grid");
    const empty = document.getElementById("empty-state");
    const p = result.pagination;
    state.page = Math.min(p.page, p.totalPages || 1);
    grid.innerHTML = result.worksheets.map(card).join("");
    grid.classList.toggle("d-none", p.total === 0);
    empty.classList.toggle("d-none", p.total !== 0);
    document.getElementById("result-count").textContent = `${p.total} worksheet${p.total === 1 ? "" : "s"} found - Page ${state.page} of ${p.totalPages || 1}`;
    pagination(p);
    bindCards();
    writeUrl();
  }

  async function load() {
    const grid = document.getElementById("worksheets-grid");
    grid.innerHTML = '<div class="loading"><div class="spinner-border" role="status"></div><span>Loading worksheets...</span></div>';
    try {
      const result = await WorksheetData.request({ page: state.page, pageSize: PAGE_SIZE, class: state.className, subject: state.subject, level: state.level, sort: state.sort });
      render(result);
    } catch (error) {
      console.error(error);
      grid.innerHTML = "<p>We could not load worksheets. Please refresh the page.</p>";
    }
  }

  function changePage(page) {
    if (page < 1) return;
    state.page = page;
    load().then(() => document.getElementById("worksheet-results").scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function catalogue() {
    if (!document.getElementById("worksheets-grid")) return;
    await fillOptions();
    readUrl();
    state.className = resolveClassFilterValue(state.className);
    writeUrl();
    [["class-filter", "className"], ["subject-filter", "subject"], ["level-filter", "level"], ["sort", "sort"]].forEach(([id, key]) => {
      const element = document.getElementById(id);
      if (!element) return;
      syncFilterControl(element, state[key]);
      element.addEventListener("change", event => {
        state[key] = event.target.value;
        state.page = 1;
        load();
      });
    });
    const clearFilters = document.getElementById("clear-filters");
    if (clearFilters) clearFilters.onclick = () => {
      state.className = "";
      state.subject = "";
      state.level = "";
      state.page = 1;
      ["class-filter", "subject-filter", "level-filter"].forEach(id => {
        const filter = document.getElementById(id);
        if (filter) filter.value = "";
      });
      load();
    };
    await load();
    [["class-filter", "className"], ["subject-filter", "subject"], ["level-filter", "level"], ["sort", "sort"]].forEach(([id, key]) => {
      syncFilterControl(document.getElementById(id), state[key]);
    });
  }

  async function home() {
    const box = document.getElementById("featured-grid");
    if (!box) return;
    try {
      const rows = (await WorksheetData.request({ page: 1, pageSize: 3, sort: "newest", featured: "true" })).worksheets;
      box.innerHTML = rows.map(card).join("");
      bindCards();
    } catch (error) {
      console.error(error);
      box.innerHTML = "<p>We could not load featured worksheets.</p>";
    }
  }

  return { init: async () => { await catalogue(); await home(); } };
})();

document.addEventListener("DOMContentLoaded", WorksheetUI.init);
