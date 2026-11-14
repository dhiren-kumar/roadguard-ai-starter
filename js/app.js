// Shared browser-side authentication helpers.
// The server remains the authority for every protected operation.
function getRoadGuardToken() {
    return sessionStorage.getItem("roadguard_token");
}

function getRoadGuardUser() {
    try {
        return JSON.parse(sessionStorage.getItem("roadguard_user") || "null");
    } catch {
        return null;
    }
}

async function roadGuardRequest(path, options = {}) {
    const token = getRoadGuardToken();
    const response = await fetch(path, {
        ...options,
        headers: {
            ...(options.headers || {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
    });
    if (response.status === 401) {
        sessionStorage.removeItem("roadguard_token");
        sessionStorage.removeItem("roadguard_user");
    }
    return response;
}

function roadGuardLogout() {
    sessionStorage.removeItem("roadguard_token");
    sessionStorage.removeItem("roadguard_user");
    window.location.href = "login.html";
}
