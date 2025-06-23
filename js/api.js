// API configuration and utility functions

/**
 * Make an authenticated API request
 * @param {string} endpoint - The API endpoint (without base URL)
 * @param {Object} options - Fetch options
 * @returns {Promise<Object>} - The response data
 */
async function apiRequest(endpoint, options = {}) {
    if (!window.config?.API_URL) {
        throw new Error('API URL is not configured');
    }

    // Ensure endpoint starts with a slash
    const url = endpoint.startsWith('/') 
        ? `${window.config.API_URL}${endpoint}`
        : `${window.config.API_URL}/${endpoint}`;

    // Default headers
    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Cache-Control': 'no-cache',
        ...options.headers
    };

    // Add auth token if available
    const token = localStorage.getItem('token');
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    try {
        const response = await fetch(url, {
            ...options,
            headers,
            credentials: 'include',
            mode: 'cors',
            signal: AbortSignal.timeout(15000) // 15 second timeout
        });

        // Handle non-JSON responses
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            throw new Error(`Invalid response format: ${text}`);
        }

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || `API request failed with status ${response.status}`);
        }

        return data;
    } catch (error) {
        console.error('API request failed:', error);
        throw error;
    }
}

// API endpoints
const api = {
    // Auth
    login: (credentials) => apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials)
    }),
    
    getMe: () => apiRequest('/auth/me'),
    
    // Loans
    getLoans: (page = 1, limit = 20) => 
        apiRequest(`/loans/with-fallback?page=${page}&limit=${limit}`),
        
    getLoan: (id) => apiRequest(`/loans/${id}`),
    
    // Payments
    getPayments: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return apiRequest(`/payments?${query}`);
    },
    
    // Reports
    getReports: (type, params = {}) => {
        const query = new URLSearchParams(params).toString();
        return apiRequest(`/reports/${type}?${query}`);
    },
    
    // User management
    getUsers: () => apiRequest('/users'),
    
    // Utility
    checkStatus: () => apiRequest('/status')
};

// Make API available globally
window.api = api;
