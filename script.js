const API_BASE = "https://api.github.com";
const PER_PAGE = 100;
const DELETE_DELAY = 500;
const DEBOUNCE_MS = 300;
const VISIBLE_INCREMENT = 50;

const state = {
  token: null,
  username: null,
  user: null,
  repos: [],
  filteredRepos: [],
  selectedRepos: new Set(),
  filter: "all",
  sort: "updated-desc",
  search: "",
  dangerMode: false,
  isLoading: false,
  visibleCount: VISIBLE_INCREMENT,
  failedDeletions: [],
};

const $ = (id) => document.getElementById(id);

const dom = {
  authSection: $("authSection"),
  dashboardSection: $("dashboardSection"),
  usernameInput: $("usernameInput"),
  tokenInput: $("tokenInput"),
  toggleTokenBtn: $("toggleTokenBtn"),
  connectBtn: $("connectBtn"),
  authError: $("authError"),
  authErrorText: $("authErrorText"),
  disconnectBtn: $("disconnectBtn"),
  userDisplayName: $("userDisplayName"),
  userLoginName: $("userLoginName"),
  statTotal: $("statTotal"),
  statPublic: $("statPublic"),
  statPrivate: $("statPrivate"),
  statSelected: $("statSelected"),
  searchInput: $("searchInput"),
  filterSelect: $("filterSelect"),
  sortSelect: $("sortSelect"),
  selectAllLabel: $("selectAllLabel"),
  selectAllCheck: $("selectAllCheck"),
  exportCsvBtn: $("exportCsvBtn"),
  dangerBar: $("dangerBar"),
  dangerToggle: $("dangerToggle"),
  repoGrid: $("repoGrid"),
  skeletonGrid: $("skeletonGrid"),
  emptyState: $("emptyState"),
  loadMoreWrapper: $("loadMoreWrapper"),
  loadMoreBtn: $("loadMoreBtn"),
  refreshBtn: $("refreshBtn"),
  floatingBar: $("floatingBar"),
  floatCount: $("floatCount"),
  deselectAllBtn: $("deselectAllBtn"),
  deleteSelectedBtn: $("deleteSelectedBtn"),
  deleteModal: $("deleteModal"),
  deleteStep1: $("deleteStep1"),
  deleteStep2: $("deleteStep2"),
  deleteRepoList: $("deleteRepoList"),
  cancelDeleteBtn: $("cancelDeleteBtn"),
  continueDeleteBtn: $("continueDeleteBtn"),
  confirmDeleteInput: $("confirmDeleteInput"),
  backDeleteBtn: $("backDeleteBtn"),
  finalDeleteBtn: $("finalDeleteBtn"),
  deleteCountFinal: $("deleteCountFinal"),
  progressModal: $("progressModal"),
  progressFill: $("progressFill"),
  progressText: $("progressText"),
  progressLog: $("progressLog"),
  progressSubtext: $("progressSubtext"),
  resultsModal: $("resultsModal"),
  resultsSummary: $("resultsSummary"),
  resultsLog: $("resultsLog"),
  retryFailedBtn: $("retryFailedBtn"),
  doneResultsBtn: $("doneResultsBtn"),
  snackbar: $("snackbar"),
};


const LANG_COLORS = {
  JavaScript: "#f1e05a",
  TypeScript: "#3178c6",
  Python: "#3572A5",
  Java: "#b07219",
  Go: "#00ADD8",
  Rust: "#dea584",
  Ruby: "#701516",
  PHP: "#4F5D95",
  C: "#555555",
  "C++": "#f34b7d",
  "C#": "#178600",
  Swift: "#F05138",
  Kotlin: "#A97BFF",
  Dart: "#00B4AB",
  HTML: "#e34c26",
  CSS: "#563d7c",
  Shell: "#89e051",
  Vue: "#41b883",
  Svelte: "#ff3e00",
  Lua: "#000080",
  Perl: "#0298c3",
  R: "#198CE7",
  Scala: "#c22d40",
  Haskell: "#5e5086",
  Elixir: "#6e4a7e",
  Clojure: "#db5855",
  Jupyter: "#DA5B0B",
  SCSS: "#c6538c",
  Makefile: "#427819",
};

async function apiRequest(endpoint, options = {}) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (state.token) {
    headers["Authorization"] = "Bearer " + state.token;
  }
  const resp = await fetch(API_BASE + endpoint, {
    ...options,
    headers: { ...headers, ...options.headers },
  });

  if (resp.status === 401) {
    throw new Error(
      "Token akses tidak valid atau telah kedaluwarsa. Harap periksa token Anda.",
    );
  }
  if (resp.status === 403) {
    const resetTime = resp.headers.get("X-RateLimit-Reset");
    let msg = "Access forbidden.";
    if (resetTime) {
      const resetDate = new Date(parseInt(resetTime, 10) * 1000);
      msg =
        "Rate limit exceeded. Resets at " +
        resetDate.toLocaleTimeString() +
        ".";
    }
    throw new Error(msg);
  }
  if (resp.status === 404) {
    throw new Error("Resource not found (404).");
  }
  if (!resp.ok) {
    throw new Error("API error: " + resp.status + " " + resp.statusText);
  }
  if (resp.status === 204) return null;
  return resp.json();
}

async function validateToken() {
  return apiRequest("/user");
}

async function fetchAllRepos() {
  let page = 1;
  let allRepos = [];
  let hasMore = true;

  while (hasMore) {
    const repos = await apiRequest(
      "/user/repos?per_page=" +
        PER_PAGE +
        "&page=" +
        page +
        "&type=owner&sort=updated&direction=desc",
    );
    allRepos = allRepos.concat(repos);
    hasMore = repos.length === PER_PAGE;
    page++;
  }
  return allRepos;
}

async function deleteRepo(owner, repo) {
  return apiRequest("/repos/" + owner + "/" + repo, { method: "DELETE" });
}

function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now - d;
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) return "Hari ini";
  if (diffDays === 1) return "Kemarin";
  if (diffDays < 30) return diffDays + " hari yang lalu";
  if (diffDays < 365) return Math.floor(diffDays / 30) + " bulan yang lalu";
  return Math.floor(diffDays / 365) + " tahun yang lalu";
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function animateCounter(element, target) {
  const duration = 500;
  const startTime = performance.now();
  const startVal = parseInt(element.textContent, 10) || 0;

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = Math.round(startVal + (target - startVal) * eased);
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

let snackTimer = null;
function showSnackbar(message, type) {
  type = type || "info";
  clearTimeout(snackTimer);
  dom.snackbar.className = "snackbar snack-" + type;
  dom.snackbar.textContent = message;
  // Force reflow
  void dom.snackbar.offsetWidth;
  dom.snackbar.classList.add("visible");
  snackTimer = setTimeout(() => {
    dom.snackbar.classList.remove("visible");
  }, 3500);
}

function addRipple(e) {
  const target = e.currentTarget;
  const circle = document.createElement("span");
  const diameter = Math.max(target.clientWidth, target.clientHeight);
  const radius = diameter / 2;
  const rect = target.getBoundingClientRect();
  circle.style.width = circle.style.height = diameter + "px";
  circle.style.left = e.clientX - rect.left - radius + "px";
  circle.style.top = e.clientY - rect.top - radius + "px";
  circle.classList.add("ripple-effect");
  const existing = target.querySelector(".ripple-effect");
  if (existing) existing.remove();
  target.appendChild(circle);
  setTimeout(() => circle.remove(), 600);
}

function attachRipples() {
  document.querySelectorAll(".btn, .icon-btn").forEach((btn) => {
    btn.removeEventListener("pointerdown", addRipple);
    btn.addEventListener("pointerdown", addRipple);
  });
}

async function handleConnect() {
  const username = dom.usernameInput.value.trim();
  const token = dom.tokenInput.value.trim();

  if (!username || !token) {
    showAuthError("Harap masukkan nama pengguna dan token.");
    return;
  }

  state.username = username;
  state.token = token;
  dom.authError.classList.add("hidden");

  // Show loading state on button
  dom.connectBtn.disabled = true;
  dom.connectBtn.innerHTML =
    '<span class="spinner"></span><span>Menghubungkan...</span>';

  try {
    const user = await validateToken();
    state.user = user;
    showDashboard();
  } catch (err) {
    state.token = null;
    state.username = null;
    showAuthError(err.message);
  } finally {
    dom.connectBtn.disabled = false;
    dom.connectBtn.innerHTML =
      '<span>Muat Repositori</span><i class="fa-solid fa-arrow-right"></i>';
  }
}

function showAuthError(msg) {
  dom.authErrorText.textContent = msg;
  dom.authError.classList.remove("hidden");
  dom.authError.classList.remove("animate-shake");
  void dom.authError.offsetWidth;
  dom.authError.classList.add("animate-shake");
}

function handleDisconnect() {
  state.token = null;
  state.username = null;
  state.user = null;
  state.repos = [];
  state.filteredRepos = [];
  state.selectedRepos.clear();
  state.dangerMode = false;
  state.visibleCount = VISIBLE_INCREMENT;
  dom.dangerToggle.checked = false;
  dom.dangerBar.classList.remove("active");
  dom.repoGrid.classList.remove("danger-active");

  dom.dashboardSection.classList.add("hidden");
  dom.authSection.classList.remove("hidden");
  dom.disconnectBtn.classList.add("hidden");
  dom.floatingBar.classList.add("hidden");
  dom.usernameInput.value = "";
  dom.tokenInput.value = "";
  showSnackbar("Koneksi terputus. Token dihapus dari memori.", "info");
}

function showDashboard() {
  dom.authSection.classList.add("hidden");
  dom.dashboardSection.classList.remove("hidden");
  dom.disconnectBtn.classList.remove("hidden");

  dom.userDisplayName.textContent = state.user.name || state.user.login;
  dom.userLoginName.textContent = "@" + state.user.login;

  loadRepos();
  attachRipples();
}

async function loadRepos() {
  state.isLoading = true;
  dom.repoGrid.classList.add("hidden");
  dom.emptyState.classList.add("hidden");
  dom.loadMoreWrapper.classList.add("hidden");
  showSkeletons();

  try {
    state.repos = await fetchAllRepos();
    state.selectedRepos.clear();
    state.visibleCount = VISIBLE_INCREMENT;
    applyFilters();
    updateStats();
    updateFloatingBar();
    showSnackbar(
      "Berhasil memuat " + state.repos.length + " repositori.",
      "success",
    );
  } catch (err) {
    showSnackbar("Gagal memuat repo: " + err.message, "error");
  } finally {
    state.isLoading = false;
    hideSkeletons();
  }
}

function showSkeletons() {
  let html = "";
  for (let i = 0; i < 6; i++) {
    html +=
      '<div class="skeleton-card">' +
      '<div class="skeleton-line h-20 w-60"></div>' +
      '<div class="skeleton-line w-80"></div>' +
      '<div class="skeleton-line w-40"></div>' +
      '<div style="margin-top:18px" class="skeleton-line w-30"></div>' +
      "</div>";
  }
  dom.skeletonGrid.innerHTML = html;
  dom.skeletonGrid.classList.remove("hidden");
}

function hideSkeletons() {
  dom.skeletonGrid.classList.add("hidden");
}

function applyFilters() {
  let repos = [...state.repos];

  // Filter by visibility
  if (state.filter === "public") repos = repos.filter((r) => !r.private);
  else if (state.filter === "private") repos = repos.filter((r) => r.private);

  // Search
  if (state.search) {
    const q = state.search.toLowerCase();
    repos = repos.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.description && r.description.toLowerCase().includes(q)) ||
        (r.language && r.language.toLowerCase().includes(q)),
    );
  }

  // Sort
  switch (state.sort) {
    case "name-asc":
      repos.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case "name-desc":
      repos.sort((a, b) => b.name.localeCompare(a.name));
      break;
    case "updated-asc":
      repos.sort((a, b) => new Date(a.updated_at) - new Date(b.updated_at));
      break;
    case "stars-desc":
      repos.sort(
        (a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0),
      );
      break;
    default: // updated-desc
      repos.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  }

  state.filteredRepos = repos;
  renderRepos();
}

function renderRepos() {
  const repos = state.filteredRepos;

  if (repos.length === 0) {
    dom.repoGrid.classList.add("hidden");
    dom.emptyState.classList.remove("hidden");
    dom.loadMoreWrapper.classList.add("hidden");
    return;
  }

  dom.emptyState.classList.add("hidden");
  dom.repoGrid.classList.remove("hidden");

  const visible = repos.slice(0, state.visibleCount);
  let html = "";

  visible.forEach((repo, idx) => {
    const isSelected = state.selectedRepos.has(repo.full_name);
    const langColor = LANG_COLORS[repo.language] || "#888";
    const repoUrl = repo.html_url || "https://github.com/" + repo.full_name;

    html +=
      '<div class="repo-card' +
      (isSelected ? " selected" : "") +
      '" data-repo="' +
      escapeHtml(repo.full_name) +
      '" style="animation-delay:' +
      idx * 0.03 +
      "s; animation: fadeInUp 0.4s ease backwards " +
      idx * 0.03 +
      's">' +
      '<div class="repo-card-header">' +
      '<label class="repo-card-checkbox check-label" onclick="event.stopPropagation()">' +
      '<input type="checkbox" ' +
      (isSelected ? "checked" : "") +
      " onchange=\"toggleSelect('" +
      escapeHtml(repo.full_name) +
      "')\">" +
      '<span class="check-box"><i class="fa-solid fa-check"></i></span>' +
      "</label>" +
      '<div class="repo-card-title">' +
      '<h3><a href="' +
      escapeHtml(repoUrl) +
      '" target="_blank" rel="noopener">' +
      escapeHtml(repo.name) +
      "</a></h3>" +
      "</div>" +
      '<span class="repo-badge ' +
      (repo.private ? "badge-private" : "badge-public") +
      '">' +
      '<i class="fa-solid ' +
      (repo.private ? "fa-lock" : "fa-earth-americas") +
      '"></i>' +
      (repo.private ? "Privat" : "Publik") +
      "</span>" +
      "</div>" +
      (repo.description
        ? '<div class="repo-card-desc">' +
          escapeHtml(repo.description) +
          "</div>"
        : '<div class="repo-card-desc" style="color:var(--outline);font-style:italic">Tidak ada deskripsi</div>') +
      '<div class="repo-card-meta">' +
      (repo.language
        ? '<span class="meta-item"><span class="lang-dot" style="background:' +
          langColor +
          '"></span>' +
          escapeHtml(repo.language) +
          "</span>"
        : "") +
      '<span class="meta-item"><i class="fa-solid fa-star"></i>' +
      (repo.stargazers_count || 0) +
      "</span>" +
      '<span class="meta-item"><i class="fa-solid fa-code-fork"></i>' +
      (repo.forks_count || 0) +
      "</span>" +
      '<span class="meta-item"><i class="fa-solid fa-clock-rotate-left"></i>' +
      formatDate(repo.updated_at) +
      "</span>" +
      "</div>" +
      "</div>";
  });

  dom.repoGrid.innerHTML = html;

  // Load more
  if (state.visibleCount < repos.length) {
    dom.loadMoreWrapper.classList.remove("hidden");
  } else {
    dom.loadMoreWrapper.classList.add("hidden");
  }

  attachRipples();
}

function updateStats() {
  const total = state.repos.length;
  const pub = state.repos.filter((r) => !r.private).length;
  const priv = state.repos.filter((r) => r.private).length;
  const sel = state.selectedRepos.size;

  animateCounter(dom.statTotal, total);
  animateCounter(dom.statPublic, pub);
  animateCounter(dom.statPrivate, priv);
  animateCounter(dom.statSelected, sel);
}

function toggleSelect(fullName) {
  if (state.selectedRepos.has(fullName)) {
    state.selectedRepos.delete(fullName);
  } else {
    state.selectedRepos.add(fullName);
  }
  updateSelectionUI();
}

function selectAllVisible() {
  if (dom.selectAllCheck.checked) {
    state.filteredRepos.forEach((r) => state.selectedRepos.add(r.full_name));
  } else {
    state.filteredRepos.forEach((r) => state.selectedRepos.delete(r.full_name));
  }
  updateSelectionUI();
}

function deselectAll() {
  state.selectedRepos.clear();
  dom.selectAllCheck.checked = false;
  updateSelectionUI();
}

function updateSelectionUI() {
  animateCounter(dom.statSelected, state.selectedRepos.size);
  dom.floatCount.textContent = state.selectedRepos.size;
  updateFloatingBar();

  // Update card visual states
  document.querySelectorAll(".repo-card").forEach((card) => {
    const name = card.dataset.repo;
    const cb = card.querySelector('input[type="checkbox"]');
    if (state.selectedRepos.has(name)) {
      card.classList.add("selected");
      if (cb) cb.checked = true;
    } else {
      card.classList.remove("selected");
      if (cb) cb.checked = false;
    }
  });

  // Update select all state
  const allFiltered = state.filteredRepos.every((r) =>
    state.selectedRepos.has(r.full_name),
  );
  dom.selectAllCheck.checked = state.filteredRepos.length > 0 && allFiltered;
}

function updateFloatingBar() {
  if (state.selectedRepos.size > 0 && state.dangerMode) {
    dom.floatingBar.classList.remove("hidden");
  } else {
    dom.floatingBar.classList.add("hidden");
  }
}

function toggleDangerMode() {
  state.dangerMode = dom.dangerToggle.checked;
  dom.dangerBar.classList.toggle("active", state.dangerMode);

  if (state.dangerMode) {
    dom.repoGrid.classList.add("danger-active");
    dom.selectAllLabel.classList.remove("hidden");
  } else {
    dom.repoGrid.classList.remove("danger-active");
    dom.selectAllLabel.classList.add("hidden");
    state.selectedRepos.clear();
    dom.selectAllCheck.checked = false;
    updateSelectionUI();
  }
  updateFloatingBar();
}

function openDeleteModal() {
  if (state.selectedRepos.size === 0) return;

  // Populate step 1
  let listHtml = "";
  state.selectedRepos.forEach((fullName) => {
    const repo = state.repos.find((r) => r.full_name === fullName);
    if (!repo) return;
    listHtml +=
      '<div class="delete-repo-item">' +
      '<i class="fa-solid fa-rotate"></i>' +
      '<span class="repo-name-del">' +
      escapeHtml(repo.name) +
      "</span>" +
      '<span class="badge-sm ' +
      (repo.private ? "badge-private" : "badge-public") +
      '">' +
      (repo.private ? "Privat" : "Publik") +
      "</span>" +
      "</div>";
  });
  dom.deleteRepoList.innerHTML = listHtml;
  dom.deleteCountFinal.textContent = state.selectedRepos.size;

  // Reset steps
  dom.deleteStep1.classList.remove("hidden");
  dom.deleteStep2.classList.add("hidden");
  dom.confirmDeleteInput.value = "";
  dom.finalDeleteBtn.disabled = true;

  dom.deleteModal.classList.remove("hidden");
}

function closeDeleteModal() {
  dom.deleteModal.classList.add("hidden");
}

function showStep2() {
  dom.deleteStep1.classList.add("hidden");
  dom.deleteStep2.classList.remove("hidden");
  dom.confirmDeleteInput.value = "";
  dom.finalDeleteBtn.disabled = true;
  dom.confirmDeleteInput.focus();
}

function showStep1() {
  dom.deleteStep2.classList.add("hidden");
  dom.deleteStep1.classList.remove("hidden");
}

function checkDeleteConfirm() {
  const val = dom.confirmDeleteInput.value.trim();
  dom.finalDeleteBtn.disabled = val !== "HAPUS";
}

async function executeBulkDelete() {
  closeDeleteModal();
  dom.floatingBar.classList.add("hidden");

  const reposToDelete = [...state.selectedRepos]
    .map((fullName) => {
      return state.repos.find((r) => r.full_name === fullName);
    })
    .filter(Boolean);

  const total = reposToDelete.length;
  let completed = 0;
  const results = [];

  // Show progress modal
  dom.progressFill.style.width = "0%";
  dom.progressText.textContent = "0 / " + total;
  dom.progressLog.innerHTML = "";
  dom.progressModal.classList.remove("hidden");

  for (let i = 0; i < reposToDelete.length; i++) {
    const repo = reposToDelete[i];
    const parts = repo.full_name.split("/");
    try {
      await deleteRepo(parts[0], parts[1]);
      results.push({ repo: repo, success: true });
      addProgressLog(repo.name, true);
    } catch (err) {
      results.push({ repo: repo, success: false, error: err.message });
      addProgressLog(repo.name, false, err.message);
    }
    completed++;
    const pct = Math.round((completed / total) * 100);
    dom.progressFill.style.width = pct + "%";
    dom.progressText.textContent = completed + " / " + total;

    // Delay between requests
    if (i < reposToDelete.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, DELETE_DELAY));
    }
  }

  // Show results
  dom.progressModal.classList.add("hidden");
  showResults(results);
}

function addProgressLog(name, success, errorMsg) {
  const div = document.createElement("div");
  div.className = "log-item " + (success ? "log-success" : "log-error");
  div.innerHTML =
    '<i class="fa-solid ' +
    (success ? "fa-circle-check" : "fa-circle-xmark") +
    '"></i>' +
    '<span class="log-name">' +
    escapeHtml(name) +
    "</span>" +
    '<span class="log-status">' +
    (success ? "Dihapus" : escapeHtml(errorMsg || "Gagal")) +
    "</span>";
  dom.progressLog.appendChild(div);
  dom.progressLog.scrollTop = dom.progressLog.scrollHeight;
}

function showResults(results) {
  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;
  state.failedDeletions = results.filter((r) => !r.success);

  dom.resultsSummary.innerHTML =
    '<div class="result-box result-success"><div class="result-num">' +
    successCount +
    '</div><div class="result-label">Dihapus</div></div>' +
    '<div class="result-box result-fail"><div class="result-num">' +
    failCount +
    '</div><div class="result-label">Gagal</div></div>';

  let logHtml = "";
  results.forEach((r) => {
    logHtml +=
      '<div class="log-item ' +
      (r.success ? "log-success" : "log-error") +
      '">' +
      '<i class="fa-solid ' +
      (r.success ? "fa-circle-check" : "fa-circle-xmark") +
      '"></i>' +
      '<span class="log-name">' +
      escapeHtml(r.repo.name) +
      "</span>" +
      '<span class="log-status">' +
      (r.success ? "Dihapus" : escapeHtml(r.error || "Gagal")) +
      "</span>" +
      "</div>";
  });
  dom.resultsLog.innerHTML = logHtml;

  if (failCount > 0) {
    dom.retryFailedBtn.classList.remove("hidden");
  } else {
    dom.retryFailedBtn.classList.add("hidden");
  }

  dom.resultsModal.classList.remove("hidden");

  // Remove deleted repos from state
  const deletedNames = new Set(
    results.filter((r) => r.success).map((r) => r.repo.full_name),
  );
  state.repos = state.repos.filter((r) => !deletedNames.has(r.full_name));
  deletedNames.forEach((name) => state.selectedRepos.delete(name));
  applyFilters();
  updateStats();
}

function closeResultsModal() {
  dom.resultsModal.classList.add("hidden");
  updateFloatingBar();
}

async function retryFailed() {
  if (state.failedDeletions.length === 0) return;
  dom.resultsModal.classList.add("hidden");

  const reposToDelete = state.failedDeletions.map((r) => r.repo);
  const total = reposToDelete.length;
  let completed = 0;
  const results = [];

  dom.progressFill.style.width = "0%";
  dom.progressText.textContent = "0 / " + total;
  dom.progressLog.innerHTML = "";
  dom.progressModal.classList.remove("hidden");

  for (let i = 0; i < reposToDelete.length; i++) {
    const repo = reposToDelete[i];
    const parts = repo.full_name.split("/");
    try {
      await deleteRepo(parts[0], parts[1]);
      results.push({ repo: repo, success: true });
      addProgressLog(repo.name, true);
    } catch (err) {
      results.push({ repo: repo, success: false, error: err.message });
      addProgressLog(repo.name, false, err.message);
    }
    completed++;
    const pct = Math.round((completed / total) * 100);
    dom.progressFill.style.width = pct + "%";
    dom.progressText.textContent = completed + " / " + total;

    if (i < reposToDelete.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, DELETE_DELAY));
    }
  }

  dom.progressModal.classList.add("hidden");
  showResults(results);
}

function exportCsv() {
  if (state.repos.length === 0) {
    showSnackbar("Tidak ada repositori untuk diekspor.", "error");
    return;
  }

  const headers = [
    "Name",
    "Full Name",
    "Visibility",
    "Description",
    "Language",
    "Stars",
    "Forks",
    "Last Updated",
    "URL",
  ];
  const rows = state.filteredRepos.map((r) => [
    r.name,
    r.full_name,
    r.private ? "Private" : "Public",
    (r.description || "").replace(/"/g, '""'),
    r.language || "",
    r.stargazers_count || 0,
    r.forks_count || 0,
    r.updated_at || "",
    r.html_url || "",
  ]);

  let csv = headers.join(",") + "\n";
  rows.forEach((row) => {
    csv +=
      row.map((val) => '"' + String(val).replace(/"/g, '""') + '"').join(",") +
      "\n";
  });

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "github-repos-" + state.username + ".csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showSnackbar("CSV berhasil diekspor!", "success");
}

function attachEvents() {
  // Auth
  dom.connectBtn.addEventListener("click", handleConnect);
  dom.tokenInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleConnect();
  });
  dom.usernameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") dom.tokenInput.focus();
  });

  // Token visibility toggle
  dom.toggleTokenBtn.addEventListener("click", () => {
    const isPassword = dom.tokenInput.type === "password";
    dom.tokenInput.type = isPassword ? "text" : "password";
    const icon = dom.toggleTokenBtn.querySelector(".fa-solid");
    if (icon) {
      icon.classList.toggle("fa-eye", !isPassword);
      icon.classList.toggle("fa-eye-slash", isPassword);
    }
  });

  // Theme - REMOVED

  // Disconnect
  dom.disconnectBtn.addEventListener("click", handleDisconnect);

  // Search
  dom.searchInput.addEventListener(
    "input",
    debounce(() => {
      state.search = dom.searchInput.value.trim();
      state.visibleCount = VISIBLE_INCREMENT;
      applyFilters();
    }, DEBOUNCE_MS),
  );

  // Filter
  dom.filterSelect.addEventListener("change", () => {
    state.filter = dom.filterSelect.value;
    state.visibleCount = VISIBLE_INCREMENT;
    applyFilters();
  });

  // Sort
  dom.sortSelect.addEventListener("change", () => {
    state.sort = dom.sortSelect.value;
    state.visibleCount = VISIBLE_INCREMENT;
    applyFilters();
  });

  // Select all
  dom.selectAllCheck.addEventListener("change", selectAllVisible);

  // Danger toggle
  dom.dangerToggle.addEventListener("change", toggleDangerMode);

  // Export CSV
  dom.exportCsvBtn.addEventListener("click", exportCsv);

  // Load more
  dom.loadMoreBtn.addEventListener("click", () => {
    state.visibleCount += VISIBLE_INCREMENT;
    renderRepos();
  });

  // Refresh
  dom.refreshBtn.addEventListener("click", loadRepos);

  // Floating bar
  dom.deselectAllBtn.addEventListener("click", deselectAll);
  dom.deleteSelectedBtn.addEventListener("click", openDeleteModal);

  // Delete modal
  dom.cancelDeleteBtn.addEventListener("click", closeDeleteModal);
  dom.continueDeleteBtn.addEventListener("click", showStep2);
  dom.backDeleteBtn.addEventListener("click", showStep1);
  dom.confirmDeleteInput.addEventListener("input", checkDeleteConfirm);
  dom.finalDeleteBtn.addEventListener("click", executeBulkDelete);

  // Results modal
  dom.doneResultsBtn.addEventListener("click", closeResultsModal);
  dom.retryFailedBtn.addEventListener("click", retryFailed);

  // Close modals on overlay click
  [dom.deleteModal, dom.resultsModal].forEach((modal) => {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.classList.add("hidden");
        updateFloatingBar();
      }
    });
  });
}

function init() {
  attachEvents();
  attachRipples();
}

init();
