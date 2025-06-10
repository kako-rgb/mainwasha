// Netlify Function for handling login requests
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
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

    // Parse request body
    const { username, password } = JSON.parse(event.body);

    // Check if user exists
    const user = await User.findOne({ username });
    if (!user) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Invalid username or password' })
      };
    }

    // Check if password is correct
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Invalid username or password' })
      };
    }

    // Check if user is active
    if (user.status !== 'active') {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ message: 'Account is inactive. Please contact administrator.' })
      };
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user._id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    // Create session
    const session = {
      token,
      userAgent: event.headers['user-agent'],
      ipAddress: event.headers['client-ip'] || event.headers['x-forwarded-for'],
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 1 day from now
      isActive: true
    };

    // Add session to user and update last login
    user.sessions.push(session);
    user.lastLogin = new Date();
    await user.save();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        token,
        user: {
          id: user._id,
          username: user.username,
          fullName: user.fullName,
          email: user.email,
          role: user.role
        }
      })
    };
  } catch (error) {
    console.error('Login error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        message: 'Server error during login',
        error: error.message
      })
    };
  }
};