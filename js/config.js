// Configuration file for the application
// This file centralizes configuration settings

// Configure API URL based on environment
// Always use the Render backend API for production, regardless of the hosting domain
const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:3000/api' 
    : 'https://mainwasha.onrender.com/api';

// Log the API URL for debugging
console.log('Backend API URL configured as:', API_URL);
console.log('Current hostname:', window.location.hostname);

// Export the configuration
window.config = {
    API_URL: API_URL,
    APP_VERSION: '1.0.0',
    APP_NAME: 'Washa Enterprises LMS'
};

if (window.api || window.auth) {
    console.warn('config.js loaded after other scripts! This may cause API_URL errors.');
}