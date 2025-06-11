// Main API handler for Netlify Functions
const fetch = require('node-fetch');

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

  try {
    // Get the path from the event
    const path = event.path.replace('/.netlify/functions/api', '');
    
    // Forward the request to the Render backend
    const RENDER_API_URL = 'https://mainwasha.onrender.com/api';
    const url = `${RENDER_API_URL}${path}`;
    
    console.log(`Proxying request to: ${url}`);
    
    // Forward the request with the same method, headers, and body
    const response = await fetch(url, {
      method: event.httpMethod,
      headers: {
        ...event.headers,
        'Content-Type': 'application/json'
      },
      body: event.body ? event.body : null
    });
    
    // Get the response data
    const data = await response.text();
    
    // Return the response from the backend
    return {
      statusCode: response.status,
      headers: {
        ...headers,
        ...Object.fromEntries(response.headers)
      },
      body: data
    };
  } catch (error) {
    console.error('API proxy error:', error);
    
    // Return error response
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Internal Server Error',
        message: error.message
      })
    };
  }
};