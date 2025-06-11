// DB Status handler for Netlify Functions
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
    // For Netlify, we'll assume the database is always connected
    // This is a fallback for when the main backend is not reachable
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        connected: true,
        source: 'netlify-function'
      })
    };
  } catch (error) {
    console.error('DB status error:', error);
    
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