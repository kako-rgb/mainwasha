// Netlify Function for handling logout requests
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// MongoDB Atlas Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://kakotechnology:Gladyswi11y2020@cluster0.dfv4h.mongodb.net/?retryWrites=true&w=majority&washa=Cluster0';
const JWT_SECRET = process.env.JWT_SECRET || 'washa-enterprises-secret-key';

// User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  fullName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  role: { type: String, enum: ['admin', 'loan_officer', 'customer'], default: 'customer' },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  sessions: [
    {
      token: { type: String },
      userAgent: { type: String },
      ipAddress: { type: String },
      lastActivity: { type: Date, default: Date.now },
      expiresAt: { type: Date },
      isActive: { type: Boolean, default: true }
    }
  ],
  lastLogin: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

// Create model
let User;
try {
  // Try to get the model if it's already registered
  User = mongoose.model('User');
} catch (e) {
  // If not registered, create it
  User = mongoose.model('User', userSchema);
}

// Connect to MongoDB
async function connectDB() {
  if (mongoose.connection.readyState !== 1) {
    try {
      await mongoose.connect(MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        dbName: 'washaLoans',
        serverSelectionTimeoutMS: 30000,
        connectTimeoutMS: 30000,
        socketTimeoutMS: 45000
      });
      console.log('Connected to MongoDB Atlas');
      return true;
    } catch (err) {
      console.error('MongoDB connection error:', err);
      return false;
    }
  }
  return true;
}

// Authentication Middleware
const authenticateToken = async (event) => {
  const authHeader = event.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return { authenticated: false, error: 'Access denied. No token provided.' };
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return { authenticated: true, userId: decoded.id, token };
  } catch (error) {
    return { authenticated: false, error: 'Invalid token.' };
  }
};

exports.handler = async function(event, context) {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ message: 'Method not allowed' })
    };
  }

  try {
    // Connect to database
    const isConnected = await connectDB();
    if (!isConnected) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ message: 'Database connection failed' })
      };
    }

    // Authenticate the request
    const auth = await authenticateToken(event);
    if (!auth.authenticated) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ message: auth.error })
      };
    }

    // Find user and update session
    const user = await User.findById(auth.userId);
    if (!user) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'User not found' })
      };
    }

    // Find and deactivate the session
    const sessionIndex = user.sessions.findIndex(s => s.token === auth.token);
    if (sessionIndex !== -1) {
      user.sessions[sessionIndex].isActive = false;
      await user.save();
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'Logged out successfully' })
    };
  } catch (error) {
    console.error('Logout error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        message: 'Server error during logout',
        error: error.message
      })
    };
  }
};