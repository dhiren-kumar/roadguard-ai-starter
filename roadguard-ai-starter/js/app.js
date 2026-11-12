
/* =====================================================
   ROADGUARD AI
   Frontend connected to Express + MongoDB backend
   API: http://localhost:5000/api
===================================================== */

const API_BASE = "http://localhost:5000/api";
const BACKEND_URL = "http://localhost:5000";

const $ = (id) => document.getElementById(id);

let stream = null;
let gps = null;
let capturedImage = "";
let loginRole = "contributor";
let adminFilter = "pending";
let map = null;
let markers = [];
let publicReportsCache = [];
let currentUser = null;
let authToken = sessionStorage.getItem("roadguard_token") || "";

/* =====================================================
   HELPERS
===================================================== */

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function severityColor(severity) {
  if (severity === "high") return "#d85b4d";
  if (severity === "medium") return "#e99a36";
  return "#3b9b69";
}

function getCoordinates(report) {
  const coordinates = report.location?.coordinates || [];

  return {
    lng: Number(coordinates[0]),
    lat: Number(coordinates[1])
  };
}

function getReportName(report) {
  return report.submittedBy?.name || "Contributor";
}

function getReportEmail(report) {
  return report.submittedBy?.email || "";
}

function getImageUrl(report) {
  if (!report.imageUrl) return "";

  if (report.imageUrl.startsWith("http")) {
    return report.imageUrl;
  }

  return `${BACKEND_URL}${report.imageUrl}`;
}

function showMessage(elementId, message, isError = false) {
  const element = $(elementId);
  if (!element) return;

  element.textContent = message;
  element.style.color = isError ? "#d85b4d" : "";
}

/* =====================================================
   API REQUEST FUNCTION
===================================================== */

async function apiRequest(endpoint, options = {}) {
  const headers = { ...(options.headers || {}) };

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  if (
    options.body &&
    !(options.body instanceof FormData)
  ) {
    headers["Content-Type"] = "application/json";
  }

  let response;

  try {
    response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers
    });
  } catch (error) {
    throw new Error(
      "Cannot connect to backend. Check that your server is running on port 5000 and CORS is configured."
    );
  }

  const contentType = response.headers.get("content-type") || "";

  const data = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message = typeof data === "string"
      ? data
      : data.message || "Request failed.";

    throw new Error(message);
  }

  return data;
}

/* =====================================================
   AUTHENTICATION UI
===================================================== */

function updateLoginUI() {
  const loginButton = $("openLogin");

  if (currentUser) {
    loginButton.textContent = `Logout (${currentUser.name})`;

    if (currentUser.role === "contributor") {
      $("contributorName").value = currentUser.name || "";
      $("contributorEmail").value = currentUser.email || "";
      $("contributorName").readOnly = true;
      $("contributorEmail").readOnly = true;
    } else {
      $("contributorName").value = "";
      $("contributorEmail").value = "";
      $("contributorName").readOnly = false;
      $("contributorEmail").readOnly = false;
    }
  } else {
    loginButton.textContent = "Login";

    $("contributorName").value = "";
    $("contributorEmail").value = "";

    $("contributorName").readOnly = false;
    $("contributorEmail").readOnly = false;
  }

  $("admin").hidden = !(
    currentUser && currentUser.role === "admin"
  );
}

async function loadCurrentUser() {
  if (!authToken) {
    currentUser = null;
    updateLoginUI();
    return;
  }

  try {
    const data = await apiRequest("/auth/me");
    currentUser = data.user;
  } catch (error) {
    authToken = "";
    currentUser = null;
    sessionStorage.removeItem("roadguard_token");
  }

  updateLoginUI();

  if (currentUser?.role === "admin") {
    await loadAdminReports();
  }
}

function logout() {
  authToken = "";
  currentUser = null;

  sessionStorage.removeItem("roadguard_token");

  $("admin").hidden = true;

  updateLoginUI();

  showMessage("formMessage", "You have logged out.");
}

/* =====================================================
   OPEN LOGIN / LOGOUT
===================================================== */

$("openLogin").addEventListener("click", () => {
  if (currentUser) {
    logout();
    return;
  }

  showMessage("loginMessage", "");
  $("loginDialog").showModal();
});

/* =====================================================
   LOGIN ROLE SWITCH
===================================================== */

document.querySelectorAll(".login-switch button")
  .forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".login-switch button")
        .forEach((item) => item.classList.remove("active"));

      button.classList.add("active");

      loginRole = button.dataset.role;

      showMessage("loginMessage", "");
    });
  });

/* =====================================================
   LOGIN
===================================================== */

$("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = $("loginEmail").value.trim().toLowerCase();
  const password = $("loginPassword").value;

  showMessage("loginMessage", "Signing in...");

  try {
    const data = await apiRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });

    if (data.user.role !== loginRole) {
      throw new Error(
        loginRole === "admin"
          ? "This account is not an admin account."
          : "This account is not a contributor account."
      );
    }

    authToken = data.token;
    currentUser = data.user;

    sessionStorage.setItem("roadguard_token", authToken);

    $("loginDialog").close();
    $("loginForm").reset();

    updateLoginUI();

    if (currentUser.role === "admin") {
      await loadAdminReports();

      $("admin").scrollIntoView({
        behavior: "smooth"
      });
    } else {
      $("contribute").scrollIntoView({
        behavior: "smooth"
      });
    }

    await loadPublicReports();

  } catch (error) {
    showMessage("loginMessage", error.message, true);
  }
});

/* =====================================================
   REGISTRATION DIALOG
===================================================== */

$("openRegister").addEventListener("click", () => {
  $("loginDialog").close();

  showMessage("registerMessage", "");

  $("registerDialog").showModal();
});

$("backToLogin").addEventListener("click", () => {
  $("registerDialog").close();

  $("loginDialog").showModal();
});

/* =====================================================
   CONTRIBUTOR REGISTRATION
===================================================== */

$("registerForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const name = $("registerName").value.trim();
  const email = $("registerEmail").value.trim().toLowerCase();
  const password = $("registerPassword").value;
  const locationText = $("registerLocation").value.trim();

  showMessage("registerMessage", "Creating your account...");

  try {
    const data = await apiRequest("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        name,
        email,
        password,
        locationText
      })
    });

    showMessage(
      "registerMessage",
      data.message + " Check your email for the verification link."
    );

    $("registerForm").reset();

  } catch (error) {
    showMessage("registerMessage", error.message, true);
  }
});

/* =====================================================
   CAMERA
===================================================== */

$("startCamera").addEventListener("click", async () => {
  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camera requires HTTPS or localhost.");
    }

    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }

    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" }
      },
      audio: false
    });

    $("camera").srcObject = stream;

    $("capture").disabled = false;

  } catch (error) {
    alert("Camera access failed: " + error.message);
  }
});

/* =====================================================
   CAPTURE IMAGE
===================================================== */

$("capture").addEventListener("click", () => {
  const video = $("camera");
  const canvas = $("snapshot");

  if (!video.videoWidth) {
    alert("Wait until the camera preview appears.");
    return;
  }

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  canvas.getContext("2d").drawImage(
    video,
    0,
    0,
    canvas.width,
    canvas.height
  );

  capturedImage = canvas.toDataURL("image/jpeg", 0.85);

  $("preview").src = capturedImage;
  $("preview").hidden = false;

  showMessage("formMessage", "Image captured successfully.");
});

/* =====================================================
   GET GPS LOCATION
===================================================== */

$("getLocation").addEventListener("click", () => {
  if (!navigator.geolocation) {
    alert("Geolocation is not supported by this browser.");
    return;
  }

  $("locationStatus").textContent = "Getting location...";

  navigator.geolocation.getCurrentPosition(
    (position) => {
      gps = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };

      $("locationStatus").textContent =
        `GPS captured: ${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}`;

      document.querySelector(".status-dot").style.background =
        "#3b9b69";
    },

    (error) => {
      gps = null;

      $("locationStatus").textContent = "Location unavailable";

      alert("Location permission failed: " + error.message);
    },

    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0
    }
  );
});

/* =====================================================
   AI PLACEHOLDER
   Real trained MobileNet model will be integrated later.
===================================================== */

async function runEdgeDamageDetection(imageDataUrl) {
  return {
    detected: false,
    label: null,
    confidence: 0,
    note: "AI model not connected yet."
  };
}

/* =====================================================
   SUBMIT REPORT TO BACKEND
===================================================== */

$("reportForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!authToken || !currentUser) {
    showMessage(
      "formMessage",
      "Please log in as a contributor first.",
      true
    );

    $("loginDialog").showModal();
    return;
  }

  if (currentUser.role !== "contributor") {
    showMessage(
      "formMessage",
      "Only contributors can submit reports.",
      true
    );
    return;
  }

  if (!gps) {
    showMessage(
      "formMessage",
      "Please capture your GPS location first.",
      true
    );
    return;
  }

  if (!capturedImage) {
    showMessage(
      "formMessage",
      "Please capture a road image first.",
      true
    );
    return;
  }

  if (
    !$("damageType").value ||
    !$("severity").value ||
    !$("description").value.trim()
  ) {
    showMessage(
      "formMessage",
      "Please complete all report details.",
      true
    );
    return;
  }

  try {
    showMessage("formMessage", "Uploading report and image...");

    const imageBlob = await fetch(capturedImage)
      .then(response => response.blob());

    const formData = new FormData();

    formData.append("image", imageBlob, "road-damage.jpg");

    formData.append("latitude", String(gps.lat));
    formData.append("longitude", String(gps.lng));

    formData.append("damageType", $("damageType").value);
    formData.append("severity", $("severity").value);

    formData.append(
      "description",
      $("description").value.trim()
    );

    const data = await apiRequest("/reports", {
      method: "POST",
      body: formData
    });

    showMessage("formMessage", data.message);

    $("reportForm").reset();

    capturedImage = "";
    gps = null;

    $("preview").hidden = true;

    $("locationStatus").textContent = "Location not captured";

    document.querySelector(".status-dot").style.background = "";

    $("capture").disabled = !stream;

    if (currentUser.role === "admin") {
      await loadAdminReports();
    }

  } catch (error) {
    showMessage("formMessage", error.message, true);
  }
});

/* =====================================================
   MAP INITIALIZATION
===================================================== */

function startMap() {
  if (!window.L || map) return;

  map = L.map("map").setView(
    [20.2961, 85.8245],
    12
  );

  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      attribution: "&copy; OpenStreetMap contributors"
    }
  ).addTo(map);
}

/* =====================================================
   PUBLIC REPORT RENDERING
===================================================== */

function renderPublicReports(reports) {
  if (!map) return;

  markers.forEach(item => {
    map.removeLayer(item.marker);
  });

  markers = [];

  const query = $("searchReports").value.trim().toLowerCase();

  const filteredReports = reports.filter(report => {
    const searchText = [
      report.damageType,
      report.description,
      getReportName(report),
      report.status
    ].join(" ").toLowerCase();

    return searchText.includes(query);
  });

  $("publicReports").innerHTML = "";

  if (filteredReports.length === 0) {
    $("publicReports").innerHTML =
      "<p class='muted'>No public reports found.</p>";
  }

  filteredReports.forEach(report => {
    const { lat, lng } = getCoordinates(report);

    const validGPS =
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      lat >= -90 && lat <= 90 &&
      lng >= -180 && lng <= 180;

    if (validGPS) {
      const color = severityColor(report.severity);

      const marker = L.circleMarker(
        [lat, lng],
        {
          radius: 9,
          color,
          fillColor: color,
          fillOpacity: 0.9
        }
      ).addTo(map);

      marker.bindPopup(`
        <b>${escapeHtml(report.damageType)}</b><br>
        Severity: ${escapeHtml(report.severity)}<br>
        Status: ${escapeHtml(report.status)}<br>
        ${escapeHtml(report.description)}
      `);

      markers.push({
        marker,
        reportId: report._id
      });
    }

    const card = document.createElement("article");
    card.className = "report-card";

    card.innerHTML = `
      <span class="severity-pill ${escapeHtml(report.severity)}">
        ${escapeHtml(report.severity)} severity
      </span>

      <h3>${escapeHtml(report.damageType)}</h3>

      <p>${escapeHtml(report.description)}</p>

      <p>Status: ${escapeHtml(report.status)}</p>

      <p>Reported by ${escapeHtml(getReportName(report))}</p>

      <p>${new Date(report.createdAt).toLocaleDateString()}</p>

      <button class="small-link" type="button">
        View on map →
      </button>
    `;

    card.querySelector("button").addEventListener("click", () => {
      if (!validGPS) return;

      map.setView([lat, lng], 17);

      const item = markers.find(
        markerItem => markerItem.reportId === report._id
      );

      if (item) {
        item.marker.openPopup();
      }
    });

    $("publicReports").appendChild(card);
  });

  $("approvedCount").textContent = reports.filter(
    report => report.status === "approved"
  ).length;
}

/* =====================================================
   LOAD PUBLIC REPORTS FROM MONGODB
===================================================== */

async function loadPublicReports() {
  try {
    const data = await apiRequest("/reports/public");

    publicReportsCache = data.reports || [];

    renderPublicReports(publicReportsCache);

  } catch (error) {
    $("publicReports").innerHTML = `
      <p class="muted">
        Unable to load reports: ${escapeHtml(error.message)}
      </p>
    `;
  }
}

/* Search without repeatedly calling the backend */
$("searchReports").addEventListener("input", () => {
  renderPublicReports(publicReportsCache);
});

/* =====================================================
   ADMIN DASHBOARD
===================================================== */

async function loadAdminReports() {
  if (!currentUser || currentUser.role !== "admin") {
    return;
  }

  try {
    const data = await apiRequest("/reports");

    const reports = data.reports || [];

    $("pendingCount").textContent = reports.filter(
      report => report.status === "pending"
    ).length;

    renderAdminReports(reports);

  } catch (error) {
    $("adminReports").innerHTML = `
      <p class="muted">
        Unable to load admin reports: ${escapeHtml(error.message)}
      </p>
    `;
  }
}

/* =====================================================
   RENDER ADMIN REPORTS
===================================================== */

function renderAdminReports(reports) {
  const filteredReports = reports.filter(report => {
    return adminFilter === "all" ||
      report.status === adminFilter;
  });

  $("adminReports").innerHTML = "";

  if (filteredReports.length === 0) {
    $("adminReports").innerHTML =
      "<p class='muted'>No reports in this section.</p>";
    return;
  }

  filteredReports.forEach(report => {
    const { lat, lng } = getCoordinates(report);
    const imageUrl = getImageUrl(report);

    const card = document.createElement("article");
    card.className = "admin-card";

    const imageHTML = imageUrl
      ? `<img src="${escapeHtml(imageUrl)}"
              alt="Road damage"
              class="admin-image">`
      : "";

    card.innerHTML = `
      <div class="admin-main">
        ${imageHTML}

        <div>
          <span class="severity-pill ${escapeHtml(report.severity)}">
            ${escapeHtml(report.severity)}
          </span>

          <h3>
            ${escapeHtml(report.damageType)}
            · ${escapeHtml(report.status)}
          </h3>

          <p>
            ${escapeHtml(report.description)}<br>
            By ${escapeHtml(getReportName(report))}
            (${escapeHtml(getReportEmail(report))})<br>
            GPS:
            ${Number.isFinite(lat) ? lat.toFixed(5) : "N/A"},
            ${Number.isFinite(lng) ? lng.toFixed(5) : "N/A"}
          </p>
        </div>
      </div>

      <div class="admin-actions"></div>
    `;

    const actions = card.querySelector(".admin-actions");

    const statusActions = [
      ["Approve", "approved"],
      ["Under construction", "under-construction"],
      ["Resolve", "resolved"],
      ["Reject", "rejected"]
    ];

    statusActions.forEach(([label, status]) => {
      const button = document.createElement("button");

      button.type = "button";
      button.className = "btn btn-outline";
      button.textContent = label;

      button.addEventListener("click", () => {
        updateReportStatus(report._id, status);
      });

      actions.appendChild(button);
    });

    const editButton = document.createElement("button");

    editButton.type = "button";
    editButton.className = "btn btn-outline";
    editButton.textContent = "Edit details";

    editButton.addEventListener("click", () => {
      editReport(report);
    });

    actions.appendChild(editButton);

    $("adminReports").appendChild(card);
  });
}

/* =====================================================
   ADMIN UPDATE STATUS
===================================================== */

async function updateReportStatus(id, status) {
  try {
    await apiRequest(`/reports/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    });

    await loadAdminReports();
    await loadPublicReports();

  } catch (error) {
    alert("Unable to update report: " + error.message);
  }
}

/* =====================================================
   ADMIN EDIT REPORT
===================================================== */

async function editReport(report) {
  const damageType = prompt(
    "Damage type:",
    report.damageType
  );

  if (damageType === null || !damageType.trim()) return;

  const severity = prompt(
    "Severity (low, medium, high):",
    report.severity
  );

  if (severity === null) return;

  if (!["low", "medium", "high"].includes(severity)) {
    alert("Severity must be low, medium or high.");
    return;
  }

  const description = prompt(
    "Description:",
    report.description
  );

  if (description === null) return;

  try {
    await apiRequest(`/reports/${report._id}`, {
      method: "PATCH",
      body: JSON.stringify({
        damageType: damageType.trim(),
        severity,
        description: description.trim()
      })
    });

    await loadAdminReports();
    await loadPublicReports();

    alert("Report updated successfully.");

  } catch (error) {
    alert("Unable to edit report: " + error.message);
  }
}

/* =====================================================
   ADMIN FILTER TABS
===================================================== */

document.querySelectorAll(".admin-tabs button")
  .forEach(button => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".admin-tabs button")
        .forEach(item => item.classList.remove("active"));

      button.classList.add("active");

      adminFilter = button.dataset.filter;

      loadAdminReports();
    });
  });

/* =====================================================
   ADMIN LOGOUT
===================================================== */

$("adminLogout").addEventListener("click", logout);

/* =====================================================
   INITIALIZE ROADGUARD AI
===================================================== */

startMap();

(async function initializeRoadGuard() {
  await loadCurrentUser();
  await loadPublicReports();
})();
