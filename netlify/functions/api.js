// Main API handler for Netlify Functions
exports.handler = async function(event, context) {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers,
      body: ''
    };
  }

  // Get the path from the event
  const path = event.path.replace('/.netlify/functions/api', '');
  
  // Return API information
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      message: 'Welcome to the Washa Enterprises Loan Management System API',
      version: '1.0.0',
      path: path,
      endpoints: [
        '/auth/login',
        '/auth/logout',
        '/auth/me'
      ]
    })
  };
};