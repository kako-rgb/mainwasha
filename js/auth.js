// Authentication Module
// Updated to use Render backend API (https://mainwasha.onrender.com)

// Global variables
let currentUser = null;

// Get API_URL from config.js (must be loaded before this file)
if (!window.config?.API_URL) {
    console.error('API_URL not configured - ensure config.js is loaded first');
    showGlobalError('Critical error: API_URL not configured. Please contact support.');
}

// Check if user is logged in on page load
document.addEventListener('DOMContentLoaded', () => {
    checkAuthStatus();
    setupLogoutHandler();
});

// Check authentication status
function checkAuthStatus() {
    const token = localStorage.getItem('token');
    const isLoginPage = window.location.pathname.includes('index.html') || window.location.pathname.endsWith('/') || window.location.pathname === '/';
    
    if (!token) {
        // If not on login page, redirect to login
        if (!isLoginPage) {
            window.location.href = 'index.html';
        }
        return;
    }
    
    // If we're already on the dashboard and have a token, just update user info
    if (window.location.pathname.includes('dashboard.html')) {
        fetchUserInfo();
        return;
    }
    
    // Otherwise verify token and redirect if needed
    fetchUserInfo().then(() => {
        if (isLoginPage) {
            window.location.href = 'dashboard.html';
        }
    });
}

// Fetch user info using the token
function fetchUserInfo() {
    const token = localStorage.getItem('token');
    if (!token) return Promise.resolve();
    
    // Ensure config is loaded
    if (!window.config?.API_URL) {
        console.error('API URL not configured');
        showGlobalError('Critical error: API_URL not configured. Please contact support.');
        return Promise.reject('API URL not configured');
    }
    
    // Ensure we're using the full API URL
    const userInfoUrl = `${window.config.API_URL}/auth/me`;
    console.log('Fetching user info from:', userInfoUrl);
    
    return fetch(userInfoUrl, {
        method: 'GET',
        mode: 'cors',
        credentials: 'include',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
            'Cache-Control': 'no-cache'
        },
        signal: AbortSignal.timeout(10000) // 10 second timeout
    })
    .then(async response => {
        // Check if response is JSON
        const contentType = response.headers.get('content-type');
        let data;
        
        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            // If not JSON, treat as error
            data = { message: `Server error: ${response.status} ${response.statusText}` };
        }
        
        if (!response.ok) {
            throw new Error(data.message || 'Token invalid');
        }
        return data;
    })
    .then(data => {
        currentUser = data.user;
        updateUserInfo();
        return data;
    })
    .catch(error => {
        showGlobalError('Failed to fetch user info. Please check your connection or try again later.');
        console.error('Authentication error:', error);
        localStorage.removeItem('token');
        if (!window.location.pathname.includes('index.html') && !window.location.pathname.endsWith('/')) {
            window.location.href = 'index.html';
        }
        throw error;
    });
}

// Update user info in the UI
function updateUserInfo() {
    if (!currentUser) return;
    
    const userNameElement = document.getElementById('user-name');
    const userRoleElement = document.getElementById('user-role');
    
    if (userNameElement) {
        userNameElement.textContent = currentUser.name;
    }
    
    if (userRoleElement) {
        let roleDisplay = 'User';
        switch(currentUser.role) {
            case 'admin':
                roleDisplay = 'Administrator';
                break;
            case 'loan_officer':
                roleDisplay = 'Loan Officer';
                break;
            case 'customer':
                roleDisplay = 'Customer';
                break;
        }
        userRoleElement.textContent = roleDisplay;
    }
}

// Setup logout handler
function setupLogoutHandler() {
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            logout();
        });
    }
}

// Logout function
function logout() {
    localStorage.removeItem('token');
    window.location.href = 'index.html';
}

// Login function
function login(username, password) {
    // Ensure we're using the full API URL
    const loginUrl = `${window.config.API_URL}/auth/login`;
    console.log('Making login request to:', loginUrl);
    
    return fetch(loginUrl, {
        method: 'POST',
        mode: 'cors',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
    })
    .then(async response => {
        // Check if response is JSON
        const contentType = response.headers.get('content-type');
        let data;
        
        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            // If not JSON, get text content for error message
            const text = await response.text();
            data = { message: `Server error: ${response.status} ${response.statusText}` };
        }
        
        if (!response.ok) {
            throw new Error(data.message || `HTTP ${response.status}: ${response.statusText}`);
        }
        return data;
    })
    .then(data => {
        if (data.token) {
            localStorage.setItem('token', data.token);
            currentUser = data.user;
            // Redirect to dashboard after successful login
            window.location.href = 'dashboard.html';
        }
        return data;
    });
}

// Check if user has specific role
function hasRole(role) {
    if (!currentUser) return false;
    return currentUser.role === role;
}

// Check if user has admin privileges
function isAdmin() {
    return hasRole('admin');
}

// Check if user has loan officer privileges
function isLoanOfficer() {
    return hasRole('loan_officer') || isAdmin();
}

// Get authentication headers for API requests
function getAuthHeaders() {
    const token = localStorage.getItem('token');
    return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };
}

// Handle login form submission
if (document.getElementById('loginForm')) {
    document.getElementById('loginForm').addEventListener('submit', (e) => {
        e.preventDefault();
        
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const errorElement = document.getElementById('loginError');
        
        // Simple validation
        if (!username || !password) {
            errorElement.textContent = 'Please enter both username and password';
            return;
        }
        
        // Clear previous errors
        errorElement.textContent = '';
        
        // Attempt login
        login(username, password)
            .then(() => {
                window.location.href = 'dashboard.html';
            })
            .catch(error => {
                console.error('Login error:', error);
                errorElement.textContent = 'Invalid username or password';
            });
    });
}

// Password visibility toggle
function togglePasswordVisibility() {
    const passwordInput = document.getElementById('password');
    const toggleIcon = document.querySelector('.toggle-password i');
    
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        toggleIcon.classList.remove('fa-eye');
        toggleIcon.classList.add('fa-eye-slash');
    } else {
        passwordInput.type = 'password';
        toggleIcon.classList.remove('fa-eye-slash');
        toggleIcon.classList.add('fa-eye');
    }
}

// Password recovery modal functions
function showPasswordRecovery() {
    const recoveryModal = new bootstrap.Modal(document.getElementById('passwordRecoveryModal'));
    recoveryModal.show();
    
    // Reset form when modal is hidden
    document.getElementById('passwordRecoveryModal').addEventListener('hidden.bs.modal', function () {
        document.getElementById('recovery-email').value = '';
        document.getElementById('recoveryError').textContent = '';
        document.getElementById('recoverySuccess').textContent = '';
    });
}

// Handle password recovery form submission
if (document.getElementById('passwordRecoveryForm')) {
    document.getElementById('passwordRecoveryForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('recovery-email').value;
        const recoveryError = document.getElementById('recoveryError');
        const recoverySuccess = document.getElementById('recoverySuccess');
        
        // Simple validation
        if (!email) {
            recoveryError.textContent = 'Please enter your email address';
            return;
        }
        
        // Clear previous messages
        recoveryError.textContent = '';
        recoverySuccess.textContent = '';
        
        try {
            // In a real app, you would send a password reset email
            // For now, we'll just show a success message
            recoverySuccess.textContent = 'If an account exists with this email, you will receive a password reset link.';
            
            // Close the modal after 3 seconds
            setTimeout(() => {
                const recoveryModal = bootstrap.Modal.getInstance(document.getElementById('passwordRecoveryModal'));
                if (recoveryModal) {
                    recoveryModal.hide();
                }
            }, 3000);
        } catch (error) {
            console.error('Password recovery error:', error);
            recoveryError.textContent = 'An error occurred. Please try again later.';
        }
    });
}

// Export auth functions
window.auth = {
    login,
    logout,
    hasRole,
    isAdmin,
    isLoanOfficer,
    getAuthHeaders,
    checkAuthStatus,
    currentUser: () => currentUser
};

// Helper to show global errors
function showGlobalError(message) {
    const el = document.getElementById('global-error');
    if (el) {
        el.textContent = message;
        el.style.display = 'block';
    } else {
        alert(message);
    }
}
