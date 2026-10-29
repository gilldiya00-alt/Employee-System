
"use strict";

// ==========================================
// 1. CONFIGURATION
// ==========================================

const TOKEN_KEY = "employee_salary_token";
const USER_KEY = "employee_salary_user";
const API_BASE = window.PEOPLEDESK_API_BASE || "http://127.0.0.1:8000";
let authToken = localStorage.getItem(TOKEN_KEY);
let currentUser = JSON.parse(localStorage.getItem(USER_KEY) || "null");
let employees = [];
let managers = [];
let selectedEmployeeId = null;
let selectedAttendanceEmployeeId = null;

const PAGE_TITLES = {
    dashboard: "Dashboard",
    employees: "People",
    profile: "My Profile",
    attendance: "Attendance",
    salary: "Salary",
    leave: "Leave Management"
};

const MONTHS = [
    "January", "February", "March", "April",
    "May", "June", "July", "August",
    "September", "October", "November", "December"
];


// ==========================================
// 2. COMMON HELPERS
// ==========================================

function getElement(id) {
    return document.getElementById(id);
}

function getRole() {
    return String(
        currentUser?.role ??
        currentUser?.user?.role ??
        ""
    ).toLowerCase();
}

function isAdmin() {
    return ["admin", "administrator"].includes(getRole());
}

function isManager() {
    return getRole() === "manager";
}

function isEmployee() {
    return ["employee", "user"].includes(getRole());
}

function canViewPeople() {
    return isAdmin() || isManager();
}

function canReviewLeaves() {
    return isAdmin() || isManager();
}

function getEmployeeId() {
    if (!currentUser || !isEmployee()) {
        return null;
    }

    return (
        currentUser.id ??
        currentUser.employee_id ??
        currentUser.employee?.id ??
        currentUser.user?.id ??
        currentUser.user?.employee_id ??
        currentUser.sub ??
        null
    );
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

function formatCurrency(value) {
    const amount = Number(value);

    if (!Number.isFinite(amount)) {
        return "—";
    }

    return amount.toLocaleString("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2
    });
}

function formatDateTime(value) {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return escapeHTML(value);
    }

    return date.toLocaleString("en-IN");
}

function showToast(message) {
    const toast = getElement("toast");

    if (!toast) {
        alert(message);
        return;
    }

    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(showToast.timer);

    showToast.timer = setTimeout(() => {
        toast.classList.remove("show");
    }, 3000);
}

function showMessage(elementId, message) {
    const element = getElement(elementId);

    if (element) {
        element.textContent = message;
    }
}

function showNotice(message) {
    const notice = getElement("pageNotice");

    if (notice) {
        notice.textContent = message;
        notice.classList.remove("hidden");
    }
}

function hideNotice() {
    getElement("pageNotice")?.classList.add("hidden");
}

function getErrorMessage(error) {
    return error?.message || "Something went wrong.";
}


// ==========================================
// 3. COMMON API REQUEST
// ==========================================

async function callAPI(
    endpoint,
    method = "GET",
    data = null,
    needsAuth = true
) {
    const headers = {
        Accept: "application/json"
    };

    if (needsAuth) {
        const token = authToken || localStorage.getItem(TOKEN_KEY);

        if (!token) {
            throw new Error(
                "Authorization token is missing. Please sign in again."
            );
        }

        headers.Authorization = `Bearer ${token}`;
    }

    if (data !== null && !(data instanceof FormData)) {
        headers["Content-Type"] = "application/json";
    }

    const options = {
        method,
        headers
    };

    if (data !== null) {
        options.body = data instanceof FormData
            ? data
            : JSON.stringify(data);
    }

    let response;

    try {
        response = await fetch(`${API_BASE}${endpoint}`, options);
    } catch (error) {
        throw new Error(
            "Cannot connect to FastAPI. Check Uvicorn and CORS."
        );
    }

    const contentType = response.headers.get("content-type") || "";
    let result = null;

    if (response.status !== 204) {
        result = contentType.includes("application/json")
            ? await response.json()
            : await response.text();
    }

    if (!response.ok) {
        const detail =
            result?.detail ??
            result?.message ??
            (typeof result === "string" ? result : null) ??
            `Request failed with status ${response.status}`;

        if (response.status === 401 && needsAuth) {
            authToken = null;
            currentUser = null;

            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(USER_KEY);

            showLoginScreen();

            throw new Error(
                "Your token is invalid or expired. Please sign in again."
            );
        }

        throw new Error(
            typeof detail === "string"
                ? detail
                : JSON.stringify(detail)
        );
    }

    return result;
}


// ==========================================
// 4. LOGIN AND LOGOUT
// ==========================================

function showLoginScreen() {
    getElement("loginScreen")?.classList.remove("hidden");
    getElement("workspace")?.classList.add("hidden");

    document.querySelectorAll(".page-view").forEach(page => {
        page.classList.add("hidden");
    });

    getElement("sidebar")?.classList.add("logged-out");
    showMessage("loginMessage", "");
}

function showWorkspace() {
    getElement("loginScreen")?.classList.add("hidden");
    getElement("workspace")?.classList.remove("hidden");

    getElement("sidebar")?.classList.remove("logged-out");

    updateUserInformation();
    updateRolePermissions();
    closeCreateEmployee();

    goToPage("dashboard");
    loadDashboard();
}

function saveSession(token, user) {
    authToken = token;
    currentUser = user;

    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
}

async function login(event) {
    event.preventDefault();

    const email = getElement("email")?.value.trim();
    const password = getElement("password")?.value;

    if (!email || !password) {
        showMessage("loginMessage", "Enter your email and password.");
        return;
    }

    const button = getElement("loginSubmit");

    if (button) {
        button.disabled = true;
        button.textContent = "Signing in...";
    }

    showMessage("loginMessage", "");

    try {
        const result = await callAPI(
            "/user/login",
            "POST",
            { email, password },
            false
        );

        const token = result?.access_token ?? result?.token;

        if (!token) {
            throw new Error("Login response did not contain an access token.");
        }

        let user = result?.user ?? result?.employee ?? result?.data ?? {};

        try {
            const payload = JSON.parse(
                atob(
                    token.split(".")[1]
                        .replace(/-/g, "+")
                        .replace(/_/g, "/")
                )
            );

            user = { ...payload, ...user };
        } catch (error) {
            console.warn("Could not read JWT payload.");
        }

        user.email = user.email || email;

        if (user.id == null && user.sub != null) {
            user.id = user.sub;
        }

        saveSession(token, user);

        showWorkspace();

        await loadProfile(true);

        updateUserInformation();
        updateRolePermissions();

        loadDashboard();

        showToast("Welcome to PeopleDesk!");

    } catch (error) {
        showMessage("loginMessage", getErrorMessage(error));
    } finally {
        if (button) {
            button.disabled = false;
            button.innerHTML = 'Sign in <span>→</span>';
        }
    }
}

async function logout() {
    try {
        if (authToken) {
            await callAPI("/user/logout", "POST");
        }
    } catch (error) {
        console.warn("Logout API request:", error.message);
    } finally {
        authToken = null;
        currentUser = null;
        employees = [];
        selectedEmployeeId = null;
        selectedAttendanceEmployeeId = null;

        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);

        showLoginScreen();
        getElement("loginForm")?.reset();

        showToast("You have been logged out.");
    }
}


// ==========================================
// 5. NAVIGATION
// ==========================================

function goToPage(pageName) {
    const targetPage = getElement(`${pageName}Page`);

    if (!targetPage) {
        console.error("Page not found:", `${pageName}Page`);
        return;
    }

    if (!authToken) {
        showLoginScreen();
        return;
    }

    if (pageName === "employees" && !canViewPeople()) {
        showToast("You do not have access to the people directory.");
        return;
    }

    document.querySelectorAll(".page-view").forEach(page => {
        page.classList.add("hidden");
    });

    targetPage.classList.remove("hidden");

    document.querySelectorAll(".nav-item[data-page]").forEach(button => {
        button.classList.toggle(
            "active",
            button.dataset.page === pageName
        );
    });

    const title = getElement("pageTitle");

    if (title) {
        title.textContent = PAGE_TITLES[pageName] || "Welcome back";
    }

    hideNotice();
    getElement("sidebar")?.classList.remove("open");

    if (pageName === "dashboard") {
        loadDashboard();
    } else if (pageName === "employees" && isAdmin()) {
        loadEmployees();
        loadManagers();
    } else if (pageName === "employees" && isManager()) {
        loadEmployees();
    } else if (pageName === "profile") {
        loadProfile();
    } else if (pageName === "attendance") {
        if (isAdmin()) {
            if (selectedAttendanceEmployeeId) {
                loadAttendance(selectedAttendanceEmployeeId);
            }
            loadAllAttendance();
        } else {
            loadAttendance();
        }
    } else if (pageName === "salary") {
        loadSalary();
        if (isAdmin() || isManager()) loadSalaries();
    } else if (pageName === "leave") {
        loadLeaveManagement();
    }
}

function setupNavigation() {
    document.querySelectorAll("[data-page-link]").forEach(button => {
        button.addEventListener("click", () => {
            goToPage(button.dataset.pageLink);
        });
    });

    document.querySelectorAll("[data-go]").forEach(button => {
        button.addEventListener("click", () => {
            goToPage(button.dataset.go);
        });
    });
}


// ==========================================
// 6. USER INFORMATION AND PERMISSIONS
// ==========================================

function updateUserInformation() {
    const name =
        currentUser?.name ??
        currentUser?.full_name ??
        currentUser?.employee?.name ??
        currentUser?.user?.name ??
        currentUser?.email ??
        "User";

    const email =
        currentUser?.email ??
        currentUser?.user?.email ??
        "—";

    const role = getRole() || "employee";
    const id = getEmployeeId() ?? "—";

    if (getElement("sideName")) {
        getElement("sideName").textContent = name;
    }

    if (getElement("sideRole")) {
        getElement("sideRole").textContent = role;
    }

    if (getElement("sideAvatar")) {
        getElement("sideAvatar").textContent =
            String(name).charAt(0).toUpperCase();
    }

    if (getElement("welcomeTitle")) {
        getElement("welcomeTitle").textContent = `Hello, ${name}!`;
    }

    if (getElement("welcomeDescription")) {
        getElement("welcomeDescription").textContent =
            "Here is your overview for today.";
    }

    if (getElement("summaryName")) {
        getElement("summaryName").textContent = name;
    }

    if (getElement("summaryEmail")) {
        getElement("summaryEmail").textContent = email;
    }

    if (getElement("summaryId")) {
        getElement("summaryId").textContent = id;
    }

    if (getElement("summaryRole")) {
        getElement("summaryRole").textContent = role;
    }

    if (getElement("summaryRoleText")) {
        getElement("summaryRoleText").textContent = role;
    }

    if (getElement("summaryAvatar")) {
        getElement("summaryAvatar").textContent =
            String(name).charAt(0).toUpperCase();
    }

    if (getElement("statAccount")) {
        getElement("statAccount").textContent = id;
    }
}


function updateRolePermissions() {
    // Show admin-only items to admins
    document.querySelectorAll(".admin-only").forEach(element => {
        element.classList.toggle("hidden", !isAdmin());
    });

    // Hide employee-only items from admins
    document.querySelectorAll(".employee-only").forEach(element => {
        element.classList.toggle("hidden", !isEmployee());
    });

    document.querySelectorAll(".staff-only").forEach(element => {
        element.classList.toggle("hidden", !canViewPeople());
    });

    document.querySelectorAll(".reviewer-only").forEach(element => {
        element.classList.toggle("hidden", !canReviewLeaves());
    });

    getElement("attendanceActions")?.classList.toggle(
        "hidden",
        !isEmployee() && !isAdmin()
    );
}


// ==========================================
// 7. DASHBOARD
// ==========================================

async function loadDashboard() {
    if (!authToken) return;

    updateUserInformation();

    if (canViewPeople()) {
        try {
            const result = await callAPI("/employee/");

            employees = Array.isArray(result)
                ? result
                : result?.employees ?? result?.data ?? [];

            if (getElement("statEmployees")) {
                getElement("statEmployees").textContent =
                    String(employees.length);
            }
        } catch (error) {
            console.warn("Dashboard employees:", error.message);
        }

        if (isManager() || !selectedAttendanceEmployeeId) {
            if (getElement("statAttendance")) {
                getElement("statAttendance").textContent = "—";
            }

            if (getElement("statSalary")) {
                getElement("statSalary").textContent = "—";
            }

            return;
        }
    }

    const employeeId = canViewPeople()
        ? selectedAttendanceEmployeeId
        : getEmployeeId();

    if (!employeeId) return;

    try {
        const attendanceEndpoint = isAdmin()
            ? `/attendance/employee/${encodeURIComponent(employeeId)}`
            : "/attendance/me";
        const attendance = await callAPI(attendanceEndpoint);

        const records = Array.isArray(attendance)
            ? attendance
            : attendance?.records ?? attendance?.attendance ?? [];

        if (getElement("statAttendance")) {
            getElement("statAttendance").textContent =
                String(records.length);
        }
    } catch (error) {
        console.warn("Dashboard attendance:", error.message);
    }

    try {
        const now = new Date();

        const salary = await callAPI(
            `/salary/salary/${employeeId}?month=${now.getMonth() + 1}&year=${now.getFullYear()}`
        );

        const amount =
            salary?.final_salary ??
            salary?.salary ??
            salary?.monthly_salary ??
            salary?.amount ??
            salary?.total_salary;

        if (getElement("statSalary")) {
            getElement("statSalary").textContent =
                amount != null ? formatCurrency(amount) : "—";
        }
    } catch (error) {
        console.warn("Dashboard salary:", error.message);
    }
}


// ==========================================
// 8. EMPLOYEE MANAGEMENT
// ==========================================

async function loadEmployees() {
    if (!canViewPeople()) {
        showToast("You do not have access to the people directory.");
        return;
    }

    const tbody = getElement("employeesTableBody");

    if (tbody) {
        tbody.innerHTML =
            '<tr><td colspan="5">Loading employees...</td></tr>';
    }

    try {
        const result = await callAPI("/employee/");

        employees = Array.isArray(result)
            ? result
            : result?.employees ?? result?.data ?? [];

        renderEmployees();
    } catch (error) {
        if (tbody) {
            tbody.innerHTML =
                `<tr><td colspan="5">${escapeHTML(getErrorMessage(error))}</td></tr>`;
        }
    }
}

function renderEmployees() {
    const tbody = getElement("employeesTableBody");
    if (!tbody) return;

    const searchText =
        getElement("employeeSearch")?.value.trim().toLowerCase() || "";

    const filtered = employees.filter(employee => {
        const searchable = [
            employee.name,
            employee.email,
            employee.department,
            employee.id
        ].join(" ").toLowerCase();

        return searchable.includes(searchText);
    });

    if (getElement("employeeCount")) {
        getElement("employeeCount").textContent =
            `${filtered.length} employee${filtered.length === 1 ? "" : "s"}`;
    }

    if (!filtered.length) {
        tbody.innerHTML =
            '<tr><td colspan="5">No employees found.</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(employee => `
        <tr>
            <td>
                <strong>${escapeHTML(employee.name || "Unnamed")}</strong>
                <br>
                <small>${escapeHTML(employee.email || "—")}</small>
            </td>
            <td>${escapeHTML(employee.department || "—")}</td>
            <td>${formatCurrency(employee.salary)}</td>
            <td>${escapeHTML(employee.id ?? "—")}</td>
                <td class="row-actions">
                    <button type="button" class="secondary-button"
                        data-employee-id="${escapeHTML(employee.id)}">View</button>
                    ${isAdmin() ? `<button type="button" class="secondary-button"
                        data-attendance-id="${escapeHTML(employee.id)}">Attendance</button>` : ""}
                    <button type="button" class="secondary-button"
                        data-salary-id="${escapeHTML(employee.id)}">Salary</button>
                </td>
        </tr>
    `).join("");

    tbody.querySelectorAll("[data-employee-id]").forEach(button => {
        button.addEventListener("click", () => {
            loadEmployeeDetails(button.dataset.employeeId);
        });
    });

    tbody.querySelectorAll("[data-attendance-id]").forEach(button => {
        button.addEventListener("click", () => {
            selectedAttendanceEmployeeId = Number(button.dataset.attendanceId);
            goToPage("attendance");
        });
    });

    tbody.querySelectorAll("[data-salary-id]").forEach(button => {
        button.addEventListener("click", () => {
            selectedAttendanceEmployeeId = Number(button.dataset.salaryId);
            goToPage("salary");
        });
    });
}

async function loadEmployeeDetails(employeeId) {
    if (!canViewPeople()) {
        showToast("You do not have access to employee details.");
        return;
    }

    try {
        const employee = await callAPI(
            `/employee/${encodeURIComponent(employeeId)}`
        );

        selectedEmployeeId = employee.id ?? employeeId;

        const detail = getElement("employeeDetail");
        if (!detail) return;

        detail.innerHTML = `
            <div class="panel-heading">
                <div>
                    <h3>${escapeHTML(employee.name || "Employee details")}</h3>
                    <p>Employee account information</p>
                </div>
                <button type="button" class="secondary-button"
                    id="closeEmployeeDetail">Close</button>
            </div>
            <div class="summary-row"><span>Employee ID</span>
                <strong>${escapeHTML(employee.id ?? employeeId)}</strong></div>
            <div class="summary-row"><span>Email</span>
                <strong>${escapeHTML(employee.email || "—")}</strong></div>
            <div class="summary-row"><span>Department</span>
                <strong>${escapeHTML(employee.department || "—")}</strong></div>
            <div class="summary-row"><span>Monthly salary</span>
                <strong>${formatCurrency(employee.salary)}</strong></div>
            ${isAdmin() ? `
                <form id="updateEmployeeForm" class="employee-form-grid edit-employee-form">
                    <div class="form-field">
                        <label for="editEmployeeName">Full name</label>
                        <input id="editEmployeeName" value="${escapeHTML(employee.name || "")}" required>
                    </div>
                    <div class="form-field">
                        <label for="editEmployeeEmail">Email</label>
                        <input id="editEmployeeEmail" type="email" value="${escapeHTML(employee.email || "")}" required>
                    </div>
                    <div class="form-field">
                        <label for="editEmployeeDepartment">Department</label>
                        <input id="editEmployeeDepartment" value="${escapeHTML(employee.department || "")}" required>
                    </div>
                    <div class="form-field">
                        <label for="editEmployeeSalary">Monthly salary</label>
                        <input id="editEmployeeSalary" type="number" min="0" step="0.01" value="${escapeHTML(employee.salary ?? 0)}" required>
                    </div>
                    <div class="form-field">
                        <label for="editEmployeeManager">Manager</label>
                        <select id="editEmployeeManager" class="manager-select"
                            data-manager-id="${escapeHTML(employee.manager_id ?? "")}">
                            <option value="">Unassigned</option>
                        </select>
                    </div>
                    <div class="form-field">
                        <label for="editEmployeeActive">Account status</label>
                        <select id="editEmployeeActive">
                            <option value="true" ${employee.is_active ? "selected" : ""}>Active</option>
                            <option value="false" ${!employee.is_active ? "selected" : ""}>Inactive</option>
                        </select>
                    </div>
                    <div class="form-actions full-width">
                        <p class="form-message" id="updateEmployeeMessage" role="status"></p>
                        <button type="submit" class="primary-button">Save changes</button>
                    </div>
                </form>
            ` : ""}
        `;

        detail.classList.remove("hidden");

        const managerSelect = getElement("editEmployeeManager");
        if (managerSelect) {
            populateManagerSelect(managerSelect);
        }

        getElement("closeEmployeeDetail")?.addEventListener("click", () => {
            detail.classList.add("hidden");
        });
        getElement("updateEmployeeForm")?.addEventListener("submit", updateEmployee);
    } catch (error) {
        showToast(getErrorMessage(error));
    }
}

async function updateEmployee(event) {
    event.preventDefault();
    if (!isAdmin() || selectedEmployeeId == null) return;

    const payload = {
        name: getElement("editEmployeeName")?.value.trim(),
        email: getElement("editEmployeeEmail")?.value.trim(),
        department: getElement("editEmployeeDepartment")?.value.trim(),
        salary: Number(getElement("editEmployeeSalary")?.value),
        manager_id: getElement("editEmployeeManager")?.value
            ? Number(getElement("editEmployeeManager").value)
            : null,
        is_active: getElement("editEmployeeActive")?.value === "true"
    };

    try {
        await callAPI(
            `/employee/update_employee/${encodeURIComponent(selectedEmployeeId)}`,
            "PUT",
            payload
        );
        showToast("Employee details updated.");
        await loadEmployees();
        await loadEmployeeDetails(selectedEmployeeId);
    } catch (error) {
        showMessage("updateEmployeeMessage", getErrorMessage(error));
    }
}

function openCreateEmployee() {
    getElement("createEmployeePanel")?.classList.remove("hidden");
}

function closeCreateEmployee() {
    getElement("createEmployeePanel")?.classList.add("hidden");
    getElement("createEmployeeForm")?.reset();
    showMessage("createEmployeeMessage", "");
}

async function createEmployee(event) {
    event.preventDefault();

    if (!isAdmin()) {
        showToast("Only administrators can create employees.");
        return;
    }

    const employeeData = {
        name: getElement("newEmployeeName")?.value.trim(),
        email: getElement("newEmployeeEmail")?.value.trim(),
        password: getElement("newEmployeePassword")?.value,
        department: getElement("newEmployeeDepartment")?.value.trim(),
        salary: Number(getElement("newEmployeeSalary")?.value),
        manager_id: getElement("newEmployeeManager")?.value
            ? Number(getElement("newEmployeeManager").value)
            : null
    };

    const button = getElement("createEmployeeSubmit");

    if (button) {
        button.disabled = true;
        button.textContent = "Creating...";
    }

    try {
        await callAPI("/employee/create_employee", "POST", employeeData);

        showMessage("createEmployeeMessage", "Employee created successfully.");
        showToast("Employee created successfully.");

        getElement("createEmployeeForm")?.reset();
        closeCreateEmployee();

        await loadEmployees();
        loadDashboard();
    } catch (error) {
        showMessage("createEmployeeMessage", getErrorMessage(error));
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = "Create employee";
        }
    }
}

async function loadManagers() {
    const tbody = getElement("managersTableBody");
    if (!tbody || !isAdmin()) return;

    tbody.innerHTML = '<tr><td colspan="3">Loading managers...</td></tr>';

    try {
        const result = await callAPI("/manager/");
        managers = Array.isArray(result) ? result : [];
        document.querySelectorAll(".manager-select").forEach(select => {
            populateManagerSelect(select);
        });
        tbody.innerHTML = managers.length ? managers.map(manager => `
            <tr>
                <td><strong>${escapeHTML(manager.name || "Unnamed")}</strong><br>
                    <small>${escapeHTML(manager.email || "—")}</small></td>
                <td>${escapeHTML(manager.department || "—")}</td>
                <td>${escapeHTML(manager.id ?? "—")}</td>
            </tr>
        `).join("") : '<tr><td colspan="3">No managers found.</td></tr>';
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="3">${escapeHTML(getErrorMessage(error))}</td></tr>`;
    }
}

function populateManagerSelect(select) {
    const selectedManagerId = select.dataset.managerId || select.value;
    select.innerHTML = [
        '<option value="">Unassigned</option>',
        ...managers.map(manager => `
            <option value="${escapeHTML(manager.id)}">
                ${escapeHTML(manager.name || "Unnamed")}
                (${escapeHTML(manager.department || "General")})
            </option>
        `)
    ].join("");

    select.value = managers.some(
        manager => String(manager.id) === selectedManagerId
    ) ? selectedManagerId : "";
    select.dataset.managerId = select.value;
}

async function createManager(event) {
    event.preventDefault();
    if (!isAdmin()) return;

    const payload = {
        name: getElement("newManagerName")?.value.trim(),
        email: getElement("newManagerEmail")?.value.trim(),
        password: getElement("newManagerPassword")?.value,
        department: getElement("newManagerDepartment")?.value.trim()
    };
    const button = getElement("createManagerSubmit");
    if (button) button.disabled = true;
    showMessage("createManagerMessage", "");

    try {
        await callAPI("/manager/create_manager", "POST", payload);
        getElement("createManagerForm")?.reset();
        showMessage("createManagerMessage", "Manager account created.");
        await loadManagers();
    } catch (error) {
        showMessage("createManagerMessage", getErrorMessage(error));
    } finally {
        if (button) button.disabled = false;
    }
}


// ==========================================
// 9. MY PROFILE
// ==========================================

async function loadProfile(silent = false) {
    const content = getElement("profileContent");
    if (!content) return;

    if (!silent) {
        content.innerHTML = '<div class="empty-state">Loading profile...</div>';
    }

    try {
        const profile = await callAPI(
            isManager() ? "/manager/me" : "/employee/me"
        );

        currentUser = { ...currentUser, ...profile };
        localStorage.setItem(USER_KEY, JSON.stringify(currentUser));

        updateUserInformation();
        updateRolePermissions();

        content.innerHTML = `
            <div class="panel-heading">
                <div><h3>Personal details</h3>
                    <p>Your authenticated account information</p></div>
            </div>
            <div class="summary-row"><span>Name</span>
                <strong>${escapeHTML(profile.name || "—")}</strong></div>
            <div class="summary-row"><span>Email</span>
                <strong>${escapeHTML(profile.email || "—")}</strong></div>
            <div class="summary-row"><span>Employee ID</span>
                <strong>${escapeHTML(profile.id ?? profile.employee_id ?? "—")}</strong></div>
            <div class="summary-row"><span>Department</span>
                <strong>${escapeHTML(profile.department || "—")}</strong></div>
            <div class="summary-row"><span>Monthly salary</span>
                <strong>${formatCurrency(profile.salary)}</strong></div>
            <div class="summary-row"><span>Role</span>
                <strong>${escapeHTML(profile.role || getRole() || "employee")}</strong></div>
        `;
    } catch (error) {
        content.innerHTML = `
            <div class="empty-state">${escapeHTML(getErrorMessage(error))}</div>
        `;

        if (silent) console.warn("Profile:", error.message);
    }
}

async function updateAccount(event) {
    event.preventDefault();

    const currentPassword = getElement("currentPassword")?.value;
    const newEmail = getElement("newAccountEmail")?.value.trim();
    const newPassword = getElement("newAccountPassword")?.value;
    const payload = { current_password: currentPassword };

    if (newEmail) payload.new_email = newEmail;
    if (newPassword) payload.new_password = newPassword;

    const button = getElement("accountSubmit");
    showMessage("accountMessage", "");

    if (!newEmail && !newPassword) {
        showMessage("accountMessage", "Enter a new email or password.");
        return;
    }

    if (button) button.disabled = true;

    try {
        const result = await callAPI("/user/update-account", "PUT", payload);
        if (result?.email) {
            currentUser = { ...currentUser, email: result.email };
            localStorage.setItem(USER_KEY, JSON.stringify(currentUser));
            updateUserInformation();
        }
        getElement("accountForm")?.reset();
        showMessage("accountMessage", result?.message || "Account updated successfully.");
        await loadProfile(true);
    } catch (error) {
        showMessage("accountMessage", getErrorMessage(error));
    } finally {
        if (button) button.disabled = false;
    }
}


// ==========================================
// 10. ATTENDANCE
// ==========================================

async function loadAttendance(employeeId = null) {
    const tbody = getElement("attendanceTableBody");
    if (!tbody) return;

    const id = employeeId ??
        (isAdmin() ? selectedAttendanceEmployeeId : getEmployeeId());

    if (isManager()) {
        tbody.innerHTML = '<tr><td colspan="5">Attendance details are available to employees and administrators.</td></tr>';
        return;
    }

    if (!id) {
        tbody.innerHTML =
            '<tr><td colspan="5">Please select a valid employee to view attendance.</td></tr>';
        return;
    }

    tbody.innerHTML =
        '<tr><td colspan="5">Loading attendance...</td></tr>';

    try {
        const endpoint = isAdmin()
            ? `/attendance/employee/${encodeURIComponent(id)}`
            : "/attendance/me";
        const result = await callAPI(endpoint);

        const records = Array.isArray(result)
            ? result
            : result?.records ?? result?.attendance ?? [];

        if (!records.length) {
            tbody.innerHTML =
                '<tr><td colspan="5">No attendance records found.</td></tr>';
            return;
        }

        tbody.innerHTML = records.map(record => `
            <tr>
                <td>${escapeHTML(record.attendance_date ?? "—")}</td>
                <td>${formatDateTime(record.check_in)}</td>
                <td>${formatDateTime(record.check_out)}</td>
                <td>${escapeHTML(record.working_hours ?? "—")}</td>
                <td>${escapeHTML(record.status ?? "—")}</td>
            </tr>
        `).join("");
    } catch (error) {
        tbody.innerHTML =
            `<tr><td colspan="5">${escapeHTML(getErrorMessage(error))}</td></tr>`;
    }
}

async function submitAttendance(action) {
    const employeeId = isAdmin()
        ? selectedAttendanceEmployeeId
        : getEmployeeId();

    if (!employeeId) {
        showToast("Employee ID not found. Please select a valid employee.");
        return;
    }

    const checkIn = action === "check_in";
    const endpoint = isAdmin()
        ? checkIn
            ? `/attendance/employee/${encodeURIComponent(employeeId)}/check-in`
            : `/attendance/employee/${encodeURIComponent(employeeId)}/check-out`
        : checkIn
            ? "/attendance/check-in"
            : "/attendance/check-out";

    const button = getElement(checkIn ? "checkInButton" : "checkOutButton");

    if (button) button.disabled = true;

    try {
        await callAPI(endpoint, checkIn ? "POST" : "PUT");

        showToast(checkIn ? "Check-in successful." : "Check-out successful.");

        await loadAttendance(isAdmin() ? selectedAttendanceEmployeeId : null);
        await loadDashboard();
    } catch (error) {
        showToast(getErrorMessage(error));
    } finally {
        if (button) button.disabled = false;
    }
}

async function loadAllAttendance() {
    const tbody = getElement("allAttendanceTableBody");
    if (!tbody || !isAdmin()) return;

    tbody.innerHTML = '<tr><td colspan="6">Loading attendance...</td></tr>';

    try {
        const records = await callAPI("/attendance/");
        tbody.innerHTML = records.length ? records.map(record => `
            <tr>
                <td>${escapeHTML(record.employee_id)}</td>
                <td>${escapeHTML(record.attendance_date || "—")}</td>
                <td>${formatDateTime(record.check_in)}</td>
                <td>${formatDateTime(record.check_out)}</td>
                <td>${escapeHTML(record.working_hours ?? "—")}</td>
                <td>${escapeHTML(record.status || "—")}</td>
            </tr>
        `).join("") : '<tr><td colspan="6">No attendance records found.</td></tr>';
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="6">${escapeHTML(getErrorMessage(error))}</td></tr>`;
    }
}


// ==========================================
// 11. SALARY
// ==========================================

function setupSalaryFilters() {
    const monthSelect = getElement("salaryMonth");
    const yearSelect = getElement("salaryYear");

    if (!monthSelect || !yearSelect) return;

    const now = new Date();

    monthSelect.innerHTML = MONTHS.map((month, index) => `
        <option value="${index + 1}" ${index === now.getMonth() ? "selected" : ""}>
            ${month}
        </option>
    `).join("");

    const currentYear = now.getFullYear();

    yearSelect.innerHTML = Array.from(
        { length: 7 },
        (_, index) => currentYear - 3 + index
    ).map(year => `
        <option value="${year}" ${year === currentYear ? "selected" : ""}>
            ${year}
        </option>
    `).join("");
}

async function loadSalary() {
    const content = getElement("salaryContent");
    if (!content) return;

    let employeeId;

    if (isAdmin() || isManager()) {
        employeeId = selectedAttendanceEmployeeId;

        if (!employeeId) {
            content.innerHTML = `
                <div class="panel-card empty-state">
                    Please select an employee from the Employees page.
                    <br><br>
                    <button class="secondary-button" id="chooseSalaryEmployee">
                        Go to Employees
                    </button>
                </div>
            `;

            getElement("chooseSalaryEmployee")?.addEventListener(
                "click",
                () => goToPage("employees")
            );

            return;
        }
    } else {
        employeeId = getEmployeeId();
    }

    if (!employeeId) {
        content.innerHTML =
            '<div class="panel-card empty-state">Employee ID is missing. Please sign in again.</div>';
        return;
    }

    const now = new Date();
    const month = Number(getElement("salaryMonth")?.value || now.getMonth() + 1);
    const year = Number(getElement("salaryYear")?.value || now.getFullYear());

    if (!Number.isInteger(month) || month < 1 || month > 12 ||
        !Number.isInteger(year) || year < 2000) {
        content.innerHTML =
            '<div class="panel-card empty-state">Please select a valid month and year.</div>';
        return;
    }

    content.innerHTML =
        '<div class="panel-card empty-state">Loading salary...</div>';

    try {
        const result = await callAPI(
            `/salary/salary/${encodeURIComponent(employeeId)}?month=${month}&year=${year}`
        );

        const salaryValue =
            typeof result === "number" || typeof result === "string"
                ? result
                : result?.final_salary ??
                  result?.salary ??
                  result?.monthly_salary ??
                  result?.amount ??
                  result?.total_salary;

        const salary = Number(salaryValue);

        if (salaryValue == null || !Number.isFinite(salary)) {
            throw new Error("Salary amount was not found in the API response.");
        }

        const presentDays = result?.present_days ?? result?.present ?? "—";
        const halfDays = result?.half_days ?? result?.half_day ?? "—";
        const absentDays = result?.absent_days ?? result?.absent ?? "—";

        content.innerHTML = `
            <div class="panel-card">
                <div class="panel-heading">
                    <div><h3>Salary statement</h3>
                        <p>${MONTHS[month - 1]} ${year}</p>
                        <p>Employee ID: ${escapeHTML(employeeId)}</p></div>
                </div>
                <div class="salary-amount">
                    <span>Final payable salary</span>
                    <h2>${formatCurrency(salary)}</h2>
                </div>
                <div class="summary-row"><span>Present days</span>
                    <strong>${escapeHTML(presentDays)}</strong></div>
                <div class="summary-row"><span>Half days</span>
                    <strong>${escapeHTML(halfDays)}</strong></div>
                <div class="summary-row"><span>Absent days</span>
                    <strong>${escapeHTML(absentDays)}</strong></div>
            </div>
        `;
    } catch (error) {
        content.innerHTML =
            `<div class="panel-card empty-state">${escapeHTML(getErrorMessage(error))}</div>`;
    }
}

async function generateSalary() {
    if (!isAdmin()) return;

    const employeeId = Number(
        getElement("salaryEmployeeId")?.value || selectedAttendanceEmployeeId
    );
    const month = Number(getElement("salaryMonth")?.value);
    const year = Number(getElement("salaryYear")?.value);

    if (!Number.isInteger(employeeId) || employeeId < 1) {
        showMessage("generateSalaryMessage", "Choose an employee from People or enter a valid employee ID.");
        return;
    }

    const button = getElement("generateSalary");
    if (button) button.disabled = true;
    showMessage("generateSalaryMessage", "");

    try {
        await callAPI(
            `/salary/generate/${employeeId}?year=${year}&month=${month}`,
            "POST"
        );
        showMessage("generateSalaryMessage", "Salary statement generated.");
        showToast("Salary statement generated.");
        await loadSalaries();
        await loadSalary();
    } catch (error) {
        showMessage("generateSalaryMessage", getErrorMessage(error));
    } finally {
        if (button) button.disabled = false;
    }
}

async function loadSalaries() {
    const tbody = getElement("salaryTableBody");
    if (!tbody || (!isAdmin() && !isManager())) return;

    tbody.innerHTML = '<tr><td colspan="6">Loading salary statements...</td></tr>';

    try {
        const records = await callAPI("/salary/");
        tbody.innerHTML = records.length ? records.map(record => `
            <tr>
                <td>${escapeHTML(record.employee_id)}</td>
                <td>${MONTHS[(record.month || 1) - 1]} ${escapeHTML(record.year)}</td>
                <td>${formatCurrency(record.monthly_salary)}</td>
                <td>${escapeHTML(record.payable_days ?? "—")}</td>
                <td>${formatCurrency(record.final_salary)}</td>
                <td>${escapeHTML(record.status || "—")}</td>
            </tr>
        `).join("") : '<tr><td colspan="6">No salary statements found.</td></tr>';
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="6">${escapeHTML(getErrorMessage(error))}</td></tr>`;
    }
}


// ==========================================
// 12. LEAVE MANAGEMENT
// ==========================================

// Supports APIs that return either a list or an object containing a list.
function getLeaveList(result) {
    if (Array.isArray(result)) return result;

    return result?.leaves ??
        result?.records ??
        result?.data ??
        result?.requests ??
        [];
}

function getLeaveId(leave) {
    return leave.id ?? leave.leave_id ?? leave.request_id;
}

function getLeaveStatus(leave) {
    return leave.status ?? leave.leave_status ?? "Pending";
}

function renderLeaveStatus(status) {
    const value = String(status || "Pending");
    return escapeHTML(value);
}

function formatLeaveDate(value) {
    if (!value) return "—";

    // Date-only strings should remain date-only to avoid timezone shifts.
    const text = String(value);

    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        const [year, month, day] = text.split("-");
        return `${day}/${month}/${year}`;
    }

    return formatDateTime(value);
}

async function loadLeaveManagement() {
    const reviewer = canReviewLeaves();

    const adminTable = getElement("adminLeaveTableBody");
    const employeeTable = getElement("leaveTableBody");
    const adminPanel = getElement("adminLeavePanel");

    if (adminPanel) {
        adminPanel.classList.toggle("hidden", !reviewer);
    }

    const table = reviewer ? adminTable : employeeTable;
    const endpoint = reviewer ? "/leave/" : "/leave/me";
    const columnCount = reviewer ? 5 : 4;

    if (!table) {
        console.error(
            "Leave table not found:",
            reviewer ? "adminLeaveTableBody" : "leaveTableBody"
        );
        return;
    }

    // Display loading message
    table.innerHTML = `
        <tr>
            <td colspan="${columnCount}" class="empty-state">
                Loading leave requests...
            </td>
        </tr>
    `;

    try {
        const result = await callAPI(endpoint);
        const leaves = getLeaveList(result);

        if (!Array.isArray(leaves)) {
            throw new Error("Leave API did not return a list.");
        }

        if (reviewer) {
            renderAdminLeaves(leaves);
        } else {
            renderMyLeaves(leaves);
        }
    } catch (error) {
        table.innerHTML = `
            <tr>
                <td colspan="${columnCount}" class="empty-state">
                    Failed to load leave requests:
                    ${escapeHTML(getErrorMessage(error))}
                </td>
            </tr>
        `;
    }
}


function renderMyLeaves(leaves) {
    const tbody = getElement("leaveTableBody");
    if (!tbody) return;

    if (!Array.isArray(leaves) || leaves.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="empty-state">
                    You have not applied for leave yet.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = leaves.map(leave => {
        return `
            <tr>
                <td>${escapeHTML(formatLeaveDate(
                    leave.start_date ?? leave.from_date
                ))}</td>
                <td>${escapeHTML(formatLeaveDate(
                    leave.end_date ?? leave.to_date
                ))}</td>
                <td>${escapeHTML(leave.reason ?? "—")}</td>
                <td>${renderLeaveStatus(getLeaveStatus(leave))}</td>
            </tr>
        `;
    }).join("");
}
function renderAdminLeaves(leaves) {
    const tbody = getElement("adminLeaveTableBody");

    if (!tbody) {
        console.error("adminLeaveTableBody not found in HTML");
        return;
    }

    if (!Array.isArray(leaves) || leaves.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="empty-state">
                    No leave requests found.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = leaves.map(leave => {
        const id = getLeaveId(leave);
        const status = String(
            getLeaveStatus(leave) ?? "Pending"
        );

        const isPending = status.toLowerCase() === "pending";

        const employeeName = `Employee #${leave.employee_id}`;

        const actionButtons = isPending && id != null
            ? `
                <button type="button"
                    class="secondary-button"
                    data-leave-action="Approved"
                    data-leave-id="${escapeHTML(id)}">
                    Approve
                </button>

                <button type="button"
                    class="secondary-button"
                    data-leave-action="Rejected"
                    data-leave-id="${escapeHTML(id)}">
                    Reject
                </button>
            `
            : "—";

        return `
            <tr>
                <td>${escapeHTML(employeeName)}</td>
                <td>
                    ${escapeHTML(formatLeaveDate(leave.start_date))}
                    –
                    ${escapeHTML(formatLeaveDate(leave.end_date))}
                </td>
                <td>${escapeHTML(leave.reason ?? "—")}</td>
                <td>
                    ${renderLeaveStatus(status)}
                    ${
                            leave.review_note
                                ? `<br><small>Note: ${escapeHTML(leave.review_note)}</small>`
                            : ""
                    }
                </td>
                <td>${actionButtons}</td>
            </tr>
        `;
    }).join("");

    tbody.querySelectorAll("[data-leave-action]").forEach(button => {
        button.addEventListener("click", () => {
            decideLeave(
                button.dataset.leaveId,
                button.dataset.leaveAction
            );
        });
    });
}


async function submitLeaveRequest(event) {
    event.preventDefault();

    if (!isEmployee()) {
        showMessage(
            "leaveMessage",
            "Only employee accounts can submit leave requests."
        );
        return;
    }

    const startDate = getElement("leaveStartDate")?.value;
    const endDate = getElement("leaveEndDate")?.value;
    const reason = getElement("leaveReason")?.value.trim();

    if (!startDate || !endDate || !reason) {
        showMessage("leaveMessage", "Please complete all leave fields.");
        return;
    }

 const start = new Date(startDate + "T00:00:00");
const end = new Date(endDate + "T00:00:00");

if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    showMessage("leaveMessage", "Please select valid leave dates.");
    return;
}

if (end.getTime() < start.getTime()) {
    showMessage(
        "leaveMessage",
        "End date cannot be earlier than start date."
    );
    return;
}
    // Field names match the expected LeaveCreateSchema.
    const leaveData = {
        start_date: startDate,
        end_date: endDate,
        reason: reason
    };

    const button = getElement("submitLeaveButton");

    if (button) {
        button.disabled = true;
        button.textContent = "Submitting...";
    }

    showMessage("leaveMessage", "");

    try {
        await callAPI("/leave/apply", "POST", leaveData);

        showMessage("leaveMessage", "Leave request submitted successfully.");
        showToast("Leave request submitted successfully.");

        getElement("leaveForm")?.reset();

        await loadLeaveManagement();
    } catch (error) {
        showMessage("leaveMessage", getErrorMessage(error));
        showToast(getErrorMessage(error));
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = "Submit Leave Request";
        }
    }
}

async function decideLeave(leaveId, status) {
    if (!canReviewLeaves()) {
        showToast("Only managers and administrators can review leave requests.");
        return;
    }

    if (!leaveId) {
        showToast("Leave request ID is missing.");
        return;
    }

    if (!["Approved", "Rejected"].includes(status)) {
        showToast("Invalid leave decision.");
        return;
    }

    const actionText = status === "Approved" ? "approve" : "reject";

    if (!confirm(`Are you sure you want to ${actionText} this leave request?`)) {
        return;
    }

    let adminRemark = "";

    if (status === "Rejected") {
        adminRemark = prompt("Enter a reason for rejection:") || "";
    }

    try {
        await callAPI(
            `/leave/${encodeURIComponent(leaveId)}/review`,
            "PUT",
            {
                status: status.toLowerCase(),
                review_note: adminRemark
            }
        );

        showToast(`Leave request ${status.toLowerCase()} successfully.`);

        await loadLeaveManagement();
    } catch (error) {
        showToast(getErrorMessage(error));
        console.error("Leave decision error:", error);
    }
}

function setupLeaveManagement() {
    getElement("leaveForm")?.addEventListener(
        "submit",
        submitLeaveRequest
    );
    getElement("refreshLeave")?.addEventListener("click", loadLeaveManagement);
}


// ==========================================
// 13. PASSWORD VISIBILITY
// ==========================================

function togglePasswordVisibility() {
    const passwordInput = getElement("password");
    const button = getElement("togglePassword");

    if (!passwordInput || !button) return;

    const showing = passwordInput.type === "text";

    passwordInput.type = showing ? "password" : "text";
    button.textContent = showing ? "Show" : "Hide";
}


// ==========================================
// 14. MOBILE SIDEBAR
// ==========================================

function setupMobileMenu() {
    getElement("mobileMenu")?.addEventListener("click", () => {
        getElement("sidebar")?.classList.toggle("open");
    });
}


// ==========================================
// 15. API CONNECTION INDICATOR
// ==========================================

async function checkAPIConnection() {
    const label = getElement("connectionLabel");
    if (!label) return;

    try {
        const response = await fetch(`${API_BASE}/`);
        label.textContent = response.ok ? "API connected" : "API error";
    } catch (error) {
        label.textContent = "API disconnected";
    }
}


// ==========================================
// 16. EVENT LISTENERS
// ==========================================

function setupEventListeners() {
    getElement("loginForm")?.addEventListener("submit", login);
    getElement("logoutButton")?.addEventListener("click", logout);

    getElement("togglePassword")?.addEventListener(
        "click",
        togglePasswordVisibility
    );

    getElement("showCreateEmployee")?.addEventListener(
        "click",
        openCreateEmployee
    );

    getElement("cancelCreateEmployee")?.addEventListener(
        "click",
        closeCreateEmployee
    );

    getElement("createEmployeeForm")?.addEventListener(
        "submit",
        createEmployee
    );

    getElement("createManagerForm")?.addEventListener("submit", createManager);
    getElement("refreshManagers")?.addEventListener("click", loadManagers);

    getElement("refreshEmployees")?.addEventListener(
        "click",
        loadEmployees
    );

    getElement("employeeSearch")?.addEventListener(
        "input",
        renderEmployees
    );

    getElement("refreshProfile")?.addEventListener(
        "click",
        () => loadProfile()
    );
    getElement("accountForm")?.addEventListener("submit", updateAccount);

    getElement("refreshAttendance")?.addEventListener(
        "click",
        () => loadAttendance()
    );
    getElement("refreshAllAttendance")?.addEventListener("click", loadAllAttendance);

    getElement("checkInButton")?.addEventListener(
        "click",
        () => submitAttendance("check_in")
    );

    getElement("checkOutButton")?.addEventListener(
        "click",
        () => submitAttendance("check_out")
    );

    getElement("refreshSalary")?.addEventListener(
        "click",
        loadSalary
    );

    getElement("loadSalary")?.addEventListener(
        "click",
        loadSalary
    );
    getElement("generateSalary")?.addEventListener("click", generateSalary);
    getElement("refreshSalaries")?.addEventListener("click", loadSalaries);

    // Leave Management listeners only.
    setupLeaveManagement();

    setupNavigation();
    setupMobileMenu();
}


// ==========================================
// 17. APPLICATION STARTUP
// ==========================================

async function initializeApp() {
    setupEventListeners();
    setupSalaryFilters();

    await checkAPIConnection();

    if (authToken) {
        try {
            const result = await callAPI("/employee/me");

            currentUser = {
                ...currentUser,
                ...(result || {})
            };

            localStorage.setItem(
                USER_KEY,
                JSON.stringify(currentUser)
            );

            showWorkspace();
        } catch (error) {
            console.warn("Session verification:", error.message);

            authToken = null;
            currentUser = null;

            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(USER_KEY);

            showLoginScreen();
        }
    } else {
        showLoginScreen();
    }
}

document.addEventListener("DOMContentLoaded", initializeApp);
