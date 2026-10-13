const DATABASE_NAME = "pesitm-ise-project-hub";
const DATABASE_VERSION = 1;
const STORE_NAME = "projects";

const projectList = document.querySelector("#project-list");
const emptyState = document.querySelector("#empty-state");
const projectDialog = document.querySelector("#project-dialog");
const projectForm = document.querySelector("#project-form");
const searchInput = document.querySelector("#project-search");
const statusFilter = document.querySelector("#status-filter");
const toast = document.querySelector("#toast");
let databasePromise;
let projects = [];
let toastTimer;

document.querySelector("#today").textContent = new Intl.DateTimeFormat("en", {
  weekday: "long",
  month: "long",
  day: "numeric",
}).format(new Date());

function openDatabase() {
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("status", "status");
          store.createIndex("semester", "semester");
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Could not open the local database."));
      request.onblocked = () => reject(new Error("Close other project hub tabs and reload this page."));
    });
  }
  return databasePromise;
}

function transactionComplete(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Database transaction failed."));
    transaction.onabort = () => reject(transaction.error || new Error("Database transaction was cancelled."));
  });
}

async function getProjects() {
  const db = await openDatabase();
  const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not read project records."));
  });
}

async function saveProject(project) {
  const db = await openDatabase();
  const transaction = db.transaction(STORE_NAME, "readwrite");
  transaction.objectStore(STORE_NAME).put(project);
  await transactionComplete(transaction);
}

async function removeProject(id) {
  const db = await openDatabase();
  const transaction = db.transaction(STORE_NAME, "readwrite");
  transaction.objectStore(STORE_NAME).delete(id);
  await transactionComplete(transaction);
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatDate(value) {
  if (!value) return "Not set";
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    .format(new Date(year, month - 1, day));
}

function filteredProjects() {
  const search = searchInput.value.trim().toLocaleLowerCase();
  const status = statusFilter.value;
  return projects.filter((project) => {
    const matchesStatus = status === "all" || project.status === status;
    const searchable = `${project.title} ${project.team} ${project.guide} ${project.semester}`.toLocaleLowerCase();
    return matchesStatus && searchable.includes(search);
  });
}

function renderProjects() {
  const visibleProjects = filteredProjects();
  const countForStatus = (status) => projects.filter((project) => project.status === status).length;
  document.querySelector("#total-count").textContent = projects.length;
  document.querySelector("#active-count").textContent = countForStatus("In Progress");
  document.querySelector("#review-count").textContent = countForStatus("Review");
  document.querySelector("#completed-count").textContent = countForStatus("Completed");
  document.querySelector("#project-count-label").textContent = `${visibleProjects.length} of ${projects.length} ${projects.length === 1 ? "project" : "projects"}`;
  projectList.replaceChildren(...visibleProjects.map(createProjectRow));

  const isEmpty = visibleProjects.length === 0;
  emptyState.hidden = !isEmpty;
  if (projects.length === 0) {
    document.querySelector("#empty-heading").textContent = "Your project register starts here.";
    document.querySelector("#empty-copy").textContent = "Add a student project to keep teams, guides and milestones in one place.";
    document.querySelector("#empty-add").hidden = false;
  } else {
    document.querySelector("#empty-heading").textContent = "No matching projects.";
    document.querySelector("#empty-copy").textContent = "Try another search or choose a different status.";
    document.querySelector("#empty-add").hidden = true;
  }
}

function createProjectRow(project) {
  const row = document.createElement("tr");
  const titleCell = document.createElement("td");
  titleCell.className = "project-name-cell";
  const title = document.createElement("strong");
  title.textContent = project.title;
  const department = document.createElement("span");
  department.textContent = "Information Science & Engineering";
  titleCell.append(title, department);

  const teamCell = createCell(project.team);
  teamCell.className = "team-cell";
  const guideCell = createCell(project.guide || "Not assigned");
  const semesterCell = createCell(project.semester);

  const statusCell = document.createElement("td");
  const badge = document.createElement("span");
  badge.className = `status-badge status-${project.status.toLowerCase().replaceAll(" ", "-")}`;
  badge.textContent = project.status === "Review" ? "In review" : project.status;
  statusCell.append(badge);

  const deadlineCell = createCell(formatDate(project.deadline));
  deadlineCell.className = "deadline-cell";
  const actionsCell = document.createElement("td");
  actionsCell.className = "row-actions-cell";
  actionsCell.append(
    createActionButton("Edit project", "↗", () => openEditDialog(project)),
    createActionButton("Delete project", "×", () => deleteProject(project)),
  );
  row.append(titleCell, teamCell, guideCell, semesterCell, statusCell, deadlineCell, actionsCell);
  return row;
}

function createCell(value) {
  const cell = document.createElement("td");
  cell.textContent = value;
  return cell;
}

function createActionButton(label, symbol, onClick) {
  const button = document.createElement("button");
  button.className = "row-action";
  button.type = "button";
  button.setAttribute("aria-label", label);
  button.title = label;
  button.textContent = symbol;
  button.addEventListener("click", onClick);
  return button;
}

function openNewDialog() {
  projectForm.reset();
  projectForm.elements.id.value = "";
  document.querySelector("#dialog-kicker").textContent = "NEW ISE PROJECT";
  document.querySelector("#dialog-title").textContent = "Register a project";
  document.querySelector("#save-project").textContent = "Save project";
  document.querySelector("#form-error").hidden = true;
  projectDialog.showModal();
  projectForm.elements.title.focus();
}

function openEditDialog(project) {
  projectForm.elements.id.value = project.id;
  projectForm.elements.title.value = project.title;
  projectForm.elements.team.value = project.team;
  projectForm.elements.guide.value = project.guide;
  projectForm.elements.semester.value = project.semester;
  projectForm.elements.status.value = project.status;
  projectForm.elements.deadline.value = project.deadline;
  document.querySelector("#dialog-kicker").textContent = "UPDATE ISE PROJECT";
  document.querySelector("#dialog-title").textContent = "Edit project details";
  document.querySelector("#save-project").textContent = "Save changes";
  document.querySelector("#form-error").hidden = true;
  projectDialog.showModal();
  projectForm.elements.title.focus();
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2800);
}

async function refreshProjects() {
  projects = (await getProjects()).sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));
  renderProjects();
}

async function deleteProject(project) {
  if (!window.confirm(`Delete "${project.title}" from the project register?`)) return;
  try {
    await removeProject(project.id);
    await refreshProjects();
    showToast("Project deleted.");
  } catch {
    showToast("Could not delete the project. Please try again.");
  }
}

document.querySelector("#add-project").addEventListener("click", openNewDialog);
document.querySelector("#empty-add").addEventListener("click", openNewDialog);
document.querySelectorAll("[data-close-dialog]").forEach((button) => {
  button.addEventListener("click", () => projectDialog.close());
});
searchInput.addEventListener("input", renderProjects);
statusFilter.addEventListener("change", renderProjects);

projectForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(projectForm);
  const id = formData.get("id");
  const existing = projects.find((project) => project.id === id);
  const now = new Date().toISOString();
  const project = {
    id: id || makeId(),
    title: String(formData.get("title")).trim(),
    team: String(formData.get("team")).trim(),
    guide: String(formData.get("guide")).trim(),
    semester: String(formData.get("semester")),
    status: String(formData.get("status")),
    deadline: String(formData.get("deadline")),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  if (!project.title || !project.team) return;
  try {
    await saveProject(project);
    await refreshProjects();
    projectDialog.close();
    showToast(existing ? "Project details updated." : "Project registered.");
  } catch {
    const errorMessage = document.querySelector("#form-error");
    errorMessage.textContent = "The local database could not save this project. Check browser storage and try again.";
    errorMessage.hidden = false;
  }
});

async function init() {
  try {
    await refreshProjects();
  } catch {
    document.querySelector("#empty-heading").textContent = "Local database unavailable.";
    document.querySelector("#empty-copy").textContent = "Open this page in a modern browser with IndexedDB enabled, then reload.";
    document.querySelector("#empty-add").hidden = true;
    emptyState.hidden = false;
    document.querySelector("#add-project").disabled = true;
  }
}

init();