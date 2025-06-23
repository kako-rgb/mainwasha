// Backend API for Washa Enterprises Loan Management System
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');

// Load environment variables
dotenv.config();

// CSV Parsing Function
function parseCSV(filePath) {
    return new Promise((resolve, reject) => {
        const results = [];
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (data) => results.push(data))
            .on('end', () => resolve(results))
            .on('error', (error) => reject(error));
    });
}

// Get fallback data from CSV files
async function getFallbackLoanData() {
    try {
        // Try to load from CSV files
        try {
            const updatedLoans = await parseCSV(path.join(__dirname, 'old-data', 'updated loans.csv'));
            const joyceLoans = await parseCSV(path.join(__dirname, 'old-data', 'Joyce Past Data2.csv'));
            
            // Process all loans first to get the total count
            const allLoans = [];
            
            // Process updated loans with sequential IDs starting from total count
            updatedLoans.forEach((loan, index) => {
                allLoans.push({
                    _id: (updatedLoans.length - index).toString(),
                    fullName: loan['Full Names'],
                    phone: loan['phone number'],
                    amount: parseFloat(loan['Amount borrowed']) || 0,
                    date: loan['date of borrowing'],
                    status: 'pending',
                    source: 'updated_loans.csv',
                    borrower: {
                        fullName: loan['Full Names'],
                        email: '',
                        phone: loan['phone number']
                    },
                    purpose: 'Not specified',
                    term: '30'
                });
            });
            
            // Process Joyce's loans with sequential IDs continuing from the last ID
            const startId = allLoans.length + 1;
            joyceLoans.forEach((loan, index) => {
                allLoans.push({
                    _id: (startId + joyceLoans.length - index).toString(),
                    fullName: loan['Full Names'],
                    phone: loan['phone number'],
                    amount: parseFloat((loan['Amount  Issued'] || '0').replace(/[^0-9.]/g, '')) || 0,
                    date: loan['Date Issued'],
                    status: 'pending',
                    source: 'Joyce_Past_Data2.csv',
                    borrower: {
                        fullName: loan['Full Names'],
                        email: loan['Email'] || '',
                        phone: loan['phone number'] || ''
                    },
                    purpose: loan['Loan Purpose'] || 'Not specified',
                    term: '30'
                });
            });
            
            console.log(`Successfully loaded ${allLoans.length} loans from fallback data`);
            return allLoans.sort((a, b) => parseInt(b._id) - parseInt(a._id));
        } catch (csvError) {
            console.error('Error reading fallback CSV files:', csvError);
            // Return a default empty loan if all else fails
            return [{
                _id: 'fallback-empty',
                fullName: 'No Data Available',
                amount: 0,
                status: 'pending',
                borrower: {
                    fullName: 'No Data Available',
                    email: '',
                    phone: ''
                },
                purpose: 'Not available',
                date: new Date().toISOString(),
                term: '30',
                source: 'fallback-static'
            }];
        }
    } catch (error) {
        console.error('Unexpected error in getFallbackLoanData:', error);
        return [{
            _id: 'fallback-error',
            fullName: 'Error Loading Data',
            amount: 0,
            status: 'error',
            borrower: {
                fullName: 'Error Loading Data',
                email: '',
                phone: ''
            },
            purpose: 'Error loading loan data',
            date: new Date().toISOString(),
            term: '0',
            source: 'fallback-error'
        }];
    }
}

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Increase payload limit for JSON processing
app.use(express.json({ limit: '10mb' }));

// Middleware
app.use(cors({
    origin: [
        'http://localhost',
        'http://127.0.0.1', 
        'http://127.0.0.1:5500',
        'https://washaenterprises.vercel.app',
        'https://washaenterprise.vercel.app',
        'https://kakoe-com.netlify.app'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Content-Length', 'X-Requested-With', 'Cache-Control'],
    preflightContinue: false,
    optionsSuccessStatus: 204
}));

// Explicit OPTIONS handler for /api/auth/login
app.options('/api/auth/login', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', 'https://kakoe-com.netlify.app');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.status(204).end();
});
app.use(bodyParser.json());
app.use(express.static('.'));

// MongoDB Atlas Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://kakotechnology:Gladyswi11y2020@cluster0.dfv4h.mongodb.net/?retryWrites=true&w=majority&washa=Cluster0';

let isConnected = false;

// Session Schema
const sessionSchema = new mongoose.Schema({
    token: { type: String, required: true },
    userAgent: { type: String },
    ipAddress: { type: String },
    lastActivity: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    isActive: { type: Boolean, default: true }
});

// User Schema
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    fullName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    role: { type: String, enum: ['admin', 'loan_officer', 'customer'], default: 'customer' },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    sessions: [sessionSchema],
    lastLogin: { type: Date },
    createdAt: { type: Date, default: Date.now }
});

// Borrower Schema
const borrowerSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    email: { type: String }, // Made optional
    phone: { type: String, required: true, unique: false }, // Removed unique constraint
    address: { type: String }, // Made optional
    idNumber: { type: String },
    employmentStatus: { type: String },
    monthlyIncome: { type: Number, default: 0 },
    isFromPaymentImport: { type: Boolean, default: false },
    importDate: { type: Date },
    createdAt: { type: Date, default: Date.now },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

// Loan Schema
const loanSchema = new mongoose.Schema({
    borrower: { type: mongoose.Schema.Types.ObjectId, ref: 'Borrower', required: true },
    amount: { type: Number, required: true },
    interestRate: { type: Number, default: 0 }, // Made optional with default
    term: { type: Number, default: 30 }, // Made optional with default
    purpose: { type: String, default: 'Not specified' }, // Made optional with default
    status: { 
        type: String, 
        enum: ['pending', 'approved', 'active', 'completed', 'rejected', 'defaulted'], 
        default: 'pending' 
    },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedDate: { type: Date },
    disbursementDate: { type: Date },
    disbursementMethod: { type: String, enum: ['bank_transfer', 'mobile_money', 'cash'] },
    startDate: { type: Date },
    endDate: { type: Date },
    createdAt: { type: Date, default: Date.now },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes: { type: String },
    source: { type: String, default: 'system' },
    externalId: { type: String }
});

// Payment Schema
const paymentSchema = new mongoose.Schema({
    loan: { type: mongoose.Schema.Types.ObjectId, ref: 'Loan', required: true },
    amount: { type: Number, required: true },
    paymentDate: { type: Date, required: true },
    method: { 
        type: String, 
        enum: ['cash', 'bank_transfer', 'mobile_money', 'check'], 
        required: true 
    },
    status: { 
        type: String, 
        enum: ['pending', 'completed', 'failed'], 
        default: 'completed' 
    },
    notes: { type: String },
    receiptNumber: { type: String },
    isFromImport: { type: Boolean, default: false },
    importDate: { type: Date },
    createdAt: { type: Date, default: Date.now },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

// Create models
const User = mongoose.model('User', userSchema);
const Borrower = mongoose.model('Borrower', borrowerSchema);
const Loan = mongoose.model('Loan', loanSchema);
const Payment = mongoose.model('Payment', paymentSchema);

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'washa-enterprises-secret-key';

// Authentication Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.status(401).json({ message: 'Access denied. No token provided.' });
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ message: 'Invalid token.' });
        req.user = user;
        req.token = token; // Add token to request for session management
        next();
    });
};

// Role-based Authorization Middleware
const authorize = (roles = []) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
        }
        next();
    };
};

// Database connection function
const connectDB = async () => {
    try {
        await mongoose.connect(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            dbName: 'washaLoans',
            serverSelectionTimeoutMS: 30000, // 30 seconds
            connectTimeoutMS: 30000, // 30 seconds
            socketTimeoutMS: 45000 // 45 seconds
        });
        isConnected = true;
        console.log('Connected to MongoDB Atlas');
        await createAdminUser();
        return true;
    } catch (err) {
        console.error('MongoDB connection error:', err);
        isConnected = false;
        return false;
    }
};

// Initial connection
connectDB();

// Reconnect logic
setInterval(() => {
    if (!isConnected) {
        console.log('Attempting to reconnect to MongoDB...');
        connectDB();
    }
}, 30000);

// Database status endpoint
app.get('/api/db/status', (req, res) => {
    res.json({ connected: isConnected });
});

// User Registration
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password, fullName, email, role = 'customer' } = req.body;

        // Check if user already exists
        let user = await User.findOne({ username });
        if (user) {
            return res.status(400).json({ message: 'Username already exists' });
        }

        // Check if email is already registered
        user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ message: 'Email already registered' });
        }

        // Create new user
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        user = new User({
            username,
            password: hashedPassword,
            fullName,
            email,
            role
        });

        await user.save();

        // Generate JWT token
        const token = jwt.sign(
            { id: user._id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '1d' }
        );

        res.status(201).json({
            token,
            user: {
                id: user._id,
                username: user.username,
                fullName: user.fullName,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Server error during registration' });
    }
});

// User Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        // Check if user exists
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(400).json({ message: 'Invalid username or password' });
        }

        // Check if password is correct
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid username or password' });
        }

        // Check if user is active
        if (user.status !== 'active') {
            return res.status(403).json({ message: 'Account is inactive. Please contact administrator.' });
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
            userAgent: req.headers['user-agent'],
            ipAddress: req.ip || req.connection.remoteAddress,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 1 day from now
            isActive: true
        };

        // Add session to user and update last login
        user.sessions.push(session);
        user.lastLogin = new Date();
        await user.save();

        res.json({
            token,
            user: {
                id: user._id,
                username: user.username,
                fullName: user.fullName,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            message: 'Server error during login',
            error: error.message 
        });
    }
});

// User Logout
app.post('/api/auth/logout', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const token = req.token;

        // Find user and update session
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Find and deactivate the session
        const sessionIndex = user.sessions.findIndex(s => s.token === token);
        if (sessionIndex !== -1) {
            user.sessions[sessionIndex].isActive = false;
            await user.save();
        }

        res.json({ message: 'Logged out successfully' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ message: 'Server error during logout' });
    }
});

// Create admin user if not exists
async function createAdminUser() {
    try {
        const adminExists = await User.findOne({ role: 'admin' });
        if (!adminExists) {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash('admin123', salt);

            const adminUser = new User({
                username: 'admin',
                password: hashedPassword,
                fullName: 'System Administrator',
                email: 'admin@washaenterprises.com',
                role: 'admin'
            });

            await adminUser.save();
            console.log('Admin user created');
        }
    } catch (error) {
        console.error('Error creating admin user:', error);
    }
}

// Get user profile
app.get('/api/users/profile', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password -sessions');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json(user);
    } catch (error) {
        console.error('Error fetching user profile:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get current user (for auth check)
app.get('/api/auth/me', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password -sessions');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json({
            user: {
                id: user._id,
                username: user.username,
                name: user.fullName,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Error fetching current user:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get all users (admin only)
app.get('/api/users', authenticateToken, authorize(['admin']), async (req, res) => {
    try {
        const users = await User.find().select('-password -sessions');
        res.json(users);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get user count
app.get('/api/users/count', authenticateToken, async (req, res) => {
    try {
        const count = await User.countDocuments();
        res.json({ count });
    } catch (error) {
        console.error('Error counting users:', error);
        res.status(500).json({ message: 'Server error', count: 0 });
    }
});

// Get active sessions for current user
app.get('/api/users/sessions', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Filter active sessions and remove token for security
        const activeSessions = user.sessions
            .filter(session => session.isActive && new Date(session.expiresAt) > new Date())
            .map(({ token, ...rest }) => rest);

        res.json(activeSessions);
    } catch (error) {
        console.error('Error fetching sessions:', error);
        res.status(500).json({
            message: 'Failed to load active sessions',
            error: error.message
        });
    }
});

// Get count of active sessions across all users
app.get('/api/sessions/active', authenticateToken, async (req, res) => {
    try {
        // Count users with active sessions
        const now = new Date();
        const activeSessionsCount = await User.countDocuments({
            'sessions.isActive': true,
            'sessions.expiresAt': { $gt: now }
        });
        
        res.json({ 
            count: activeSessionsCount || 1, // At least 1 (current user)
            message: 'Active sessions count retrieved successfully'
        });
    } catch (error) {
        console.error('Error counting active sessions:', error);
        res.status(500).json({ 
            message: 'Failed to count active sessions',
            error: error.message,
            count: 1 // Default to 1 (current user)
        });
    }
});

// API endpoint for data status
app.get('/api/data-status', authenticateToken, async (req, res) => {
    try {
        const loanCount = await Loan.countDocuments();
        const borrowerCount = await Borrower.countDocuments();
        const paymentCount = await Payment.countDocuments();
        
        res.json({
            success: true,
            message: 'Data status retrieved',
            stats: {
                loans: loanCount,
                borrowers: borrowerCount,
                payments: paymentCount
            }
        });
    } catch (error) {
        console.error('Error getting data status:', error);
        res.status(500).json({
            success: false,
            message: 'Error retrieving data status',
            error: error.message
        });
    }
});

// Start the server
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// This function is a placeholder to maintain compatibility
async function importDataFromJsonFiles() {
    console.log('Import function is disabled. Data is now loaded from the database.');
    return {
        imported: 0,
        skipped: 0,
        errors: 0,
        total: 0
    };
}

// Get all loans with fallback to CSV if database is not available
app.get('/api/loans/with-fallback', authenticateToken, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        let limit = parseInt(req.query.limit) || 10;
        
        // If limit is 1000, return all loans without pagination
        const returnAll = limit === 1000;
        
        // Try to get data from database first
        try {
            // For count requests, just return the total count
            if (req.query.countOnly === 'true') {
                const total = await Loan.countDocuments();
                return res.json({
                    success: true,
                    data: { total },
                    source: 'database'
                });
            }

            let query = Loan.find().populate('borrower', 'fullName email phone').sort({ createdAt: -1 });
            let countQuery = Loan.countDocuments();
            
            if (!returnAll) {
                const skip = (page - 1) * limit;
                query = query.skip(skip).limit(limit);
            }
            
            const [loans, total] = await Promise.all([query, countQuery]);
            
            return res.json({
                success: true,
                data: {
                    loans: loans.map(loan => ({
                        ...loan.toObject(),
                        id: loan._id,
                        borrowerName: loan.borrower?.fullName || 'Unknown',
                        borrowerPhone: loan.borrower?.phone || 'Unknown',
                        borrowerEmail: loan.borrower?.email || ''
                    })),
                    total,
                    page,
                    limit: returnAll ? total : limit,
                    pages: returnAll ? 1 : Math.ceil(total / limit)
                },
                source: 'database'
            });
        } catch (dbError) {
            console.warn('Database not available, using fallback for loans:', dbError);
            
            // Only use fallback if database is not connected
            if (!isConnected) {
                // Fallback to static data
                const fallbackLoans = await getFallbackLoanData();
                
                // Apply pagination
                const total = fallbackLoans.length;
                const startIndex = returnAll ? 0 : (page - 1) * limit;
                const endIndex = returnAll ? total : startIndex + limit;
                const paginatedLoans = fallbackLoans.slice(startIndex, endIndex);
                
                return res.json({
                    success: true,
                    data: {
                        loans: paginatedLoans,
                        total,
                        page,
                        limit: returnAll ? total : limit,
                        pages: returnAll ? 1 : Math.ceil(total / limit)
                    },
                    source: 'fallback'
                });
            } else {
                // If database is connected but query failed for some other reason
                return res.status(500).json({
                    success: false,
                    message: 'Failed to fetch loans from database',
                    error: dbError.message
                });
            }
        }
    } catch (error) {
        console.error('Error in loans endpoint:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch loans',
            error: error.message
        });
    }
});

// Get loan applications
app.get('/api/loans/applications', authenticateToken, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        
        // Try to get data from database first
        try {
            const query = { status: 'pending' };
            const applications = await Loan.find(query)
                .populate('borrower', 'fullName email phone')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit);
                
            const total = await Loan.countDocuments(query);
            
            return res.json({
                success: true,
                data: applications,
                pagination: {
                    total,
                    page,
                    pages: Math.ceil(total / limit),
                    limit
                },
                source: 'database'
            });
        } catch (dbError) {
            console.warn('Database not available, falling back to CSV data:', dbError);
            
            // Only use fallback if database is not connected
            if (!isConnected) {
                // Get fallback data from CSV files
                const fallbackLoans = await getFallbackLoanData();
                const total = fallbackLoans.length;
                const paginatedLoans = fallbackLoans.slice(skip, skip + limit);
                
                return res.json({
                    success: true,
                    data: paginatedLoans,
                    pagination: {
                        total,
                        page,
                        pages: Math.ceil(total / limit),
                        limit
                    },
                    source: 'fallback'
                });
            } else {
                return res.status(500).json({
                    success: false,
                    message: 'Failed to fetch loan applications from database',
                    error: dbError.message
                });
            }
        }
    } catch (error) {
        console.error('Error in loan applications endpoint:', error);
        try {
            // Try to return fallback data even if there's an error
            if (!isConnected) {
                const fallbackLoans = await getFallbackLoanData();
                return res.status(200).json({
                    success: true,
                    data: fallbackLoans.slice(0, 10),
                    pagination: {
                        total: fallbackLoans.length,
                        page: 1,
                        pages: Math.ceil(fallbackLoans.length / 10),
                        limit: 10
                    },
                    source: 'fallback-error'
                });
            } else {
                throw error; // Re-throw if database is connected
            }
        } catch (fallbackError) {
            return res.status(500).json({
                success: false,
                message: 'Failed to fetch loan applications',
                error: error.message
            });
        }
    }
});

// Get dashboard summary
app.get('/api/dashboard/summary', authenticateToken, async (req, res) => {
    try {
        // Try to get data from database first
        try {
            // Get total number of loans (issued loans count)
            const totalLoansCount = await Loan.countDocuments({});
            
            // Get unique borrowers count (total number of loan users)
            const uniqueBorrowersResult = await Loan.aggregate([
                { $group: { _id: '$borrower' } },
                { $count: 'totalBorrowers' }
            ]);
            const uniqueBorrowers = uniqueBorrowersResult[0]?.totalBorrowers || 0;
            
            // Get active loans count
            const activeLoans = await Loan.countDocuments({ status: 'active' });
            
            // Get overdue loans (loans not paid after 4 weeks of disbursed date)
            const fourWeeksAgo = new Date();
            fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28); // 4 weeks = 28 days
            
            const overdueLoansData = await Loan.find({
                disbursementDate: { $lt: fourWeeksAgo },
                status: { $ne: 'completed' }
            });
            
            const overdueLoans = overdueLoansData.length;
            
            // Calculate total defaulted amount (overdue loans total)
            const totalDefaultedAmount = overdueLoansData.reduce((sum, loan) => {
                return sum + (loan.amount || 0);
            }, 0);
            
            // Calculate total disbursed amount (total of all loans)
            const totalDisbursedResult = await Loan.aggregate([
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ]);
            
            const totalDisbursed = totalDisbursedResult[0]?.total || 0;
            
            return res.json({
                success: true,
                activeLoans: totalLoansCount || 0, // Total number of loans issued
                issuedLoans: uniqueBorrowers || 0, // Total number of unique borrowers
                overdueLoans: overdueLoans || 0,
                totalDisbursed: parseFloat(totalDisbursed.toFixed(2)) || 0, // Total amount of all loans
                totalDefaultedAmount: parseFloat(totalDefaultedAmount.toFixed(2)) || 0,
                source: 'database'
            });
        } catch (dbError) {
            console.warn('Database not available, using fallback for summary:', dbError);
            
            // Only use fallback if database is not connected
            if (!isConnected) {
                // Fallback to calculated data
                const fallbackLoans = await getFallbackLoanData();
                
                // Total number of loans
                const totalLoansCount = fallbackLoans.length;
                
                // Count unique borrowers by phone number (since we don't have borrower IDs in fallback)
                const uniqueBorrowers = new Set(
                    fallbackLoans
                        .filter(loan => loan.phone || (loan.borrower && loan.borrower.phone))
                        .map(loan => loan.phone || (loan.borrower && loan.borrower.phone))
                ).size;
                
                // Active loans count
                const activeLoans = fallbackLoans.filter(loan => 
                    loan.status && loan.status.toLowerCase() === 'active'
                ).length;
                
                // Calculate overdue loans - loans not paid after 4 weeks of disbursed date
                const fourWeeksAgo = new Date();
                fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28); // 4 weeks = 28 days
                
                const overdueLoansData = fallbackLoans.filter(loan => {
                    if (!loan.disbursementDate && !loan.date) return false;
                    const loanDate = loan.disbursementDate ? new Date(loan.disbursementDate) : new Date(loan.date);
                    return loanDate < fourWeeksAgo && 
                           loan.status && loan.status.toLowerCase() !== 'paid';
                });
                
                const overdueLoans = overdueLoansData.length;
                
                // Calculate total defaulted amount (overdue loans total)
                const totalDefaultedAmount = overdueLoansData.reduce((sum, loan) => {
                    return sum + (parseFloat(loan.amount) || 0);
                }, 0);
                
                // Calculate total loans amount (total disbursed)
                const totalDisbursed = fallbackLoans.reduce((sum, loan) => {
                    return sum + (parseFloat(loan.amount) || 0);
                }, 0);
                
                return res.json({
                    success: true,
                    activeLoans: totalLoansCount || 0, // Total number of loans issued
                    issuedLoans: uniqueBorrowers || 0, // Total number of unique borrowers
                    overdueLoans: overdueLoans || 0,
                    totalDisbursed: parseFloat(totalDisbursed.toFixed(2)) || 0, // Total amount of all loans
                    totalDefaultedAmount: parseFloat(totalDefaultedAmount.toFixed(2)) || 0,
                    source: 'fallback'
                });
            } else {
                return res.status(500).json({
                    success: false,
                    message: 'Failed to fetch dashboard summary from database',
                    error: dbError.message
                });
            }
        }
    } catch (error) {
        console.error('Error in dashboard summary:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load dashboard summary',
            error: error.message
        });
    }
});

// Get users
app.get('/api/users', authenticateToken, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const search = req.query.search || '';
        const role = req.query.role || '';
        
        // Try to get data from database first
        try {
            let query = {};
            
            // Add search filter if provided
            if (search) {
                query = {
                    $or: [
                        { name: { $regex: search, $options: 'i' } },
                        { email: { $regex: search, $options: 'i' } },
                        { phone: { $regex: search, $options: 'i' } }
                    ]
                };
            }
            
            // Add role filter if provided
            if (role) {
                query.role = role;
            }
            
            // For now, return mock data
            const mockUsers = [
                {
                    id: '1',
                    name: 'John Doe',
                    phone: '+254712345678',
                    email: 'john.doe@example.com',
                    role: 'admin',
                    status: 'active'
                },
                {
                    id: '2',
                    name: 'Jane Smith',
                    phone: '+254723456789',
                    email: 'jane.smith@example.com',
                    role: 'loan_officer',
                    status: 'active'
                },
                {
                    id: '3',
                    name: 'Michael Johnson',
                    phone: '+254734567890',
                    email: 'michael.johnson@example.com',
                    role: 'customer',
                    status: 'active'
                },
                {
                    id: '4',
                    name: 'Sarah Williams',
                    phone: '+254745678901',
                    email: 'sarah.williams@example.com',
                    role: 'customer',
                    status: 'inactive'
                },
                {
                    id: '5',
                    name: 'Robert Brown',
                    phone: '+254756789012',
                    email: 'robert.brown@example.com',
                    role: 'loan_officer',
                    status: 'active'
                }
            ];
            
            // Filter mock users based on search and role
            let filteredUsers = mockUsers;
            
            if (search) {
                const searchLower = search.toLowerCase();
                filteredUsers = filteredUsers.filter(user => 
                    user.name.toLowerCase().includes(searchLower) ||
                    user.email.toLowerCase().includes(searchLower) ||
                    user.phone.includes(search)
                );
            }
            
            if (role) {
                filteredUsers = filteredUsers.filter(user => user.role === role);
            }
            
            // Calculate pagination
            const totalUsers = filteredUsers.length;
            const totalPages = Math.ceil(totalUsers / limit);
            const startIndex = (page - 1) * limit;
            const endIndex = startIndex + limit;
            const paginatedUsers = filteredUsers.slice(startIndex, endIndex);
            
            return res.json({
                success: true,
                users: paginatedUsers,
                totalUsers,
                totalPages,
                page,
                limit
            });
        } catch (dbError) {
            console.warn('Database not available, using fallback for users:', dbError);
            
            // Return mock data
            return res.json({
                success: true,
                users: [
                    {
                        id: '1',
                        name: 'John Doe',
                        phone: '+254712345678',
                        email: 'john.doe@example.com',
                        role: 'admin',
                        status: 'active'
                    },
                    {
                        id: '2',
                        name: 'Jane Smith',
                        phone: '+254723456789',
                        email: 'jane.smith@example.com',
                        role: 'loan_officer',
                        status: 'active'
                    }
                ],
                totalUsers: 2,
                totalPages: 1,
                page: 1,
                limit: 10
            });
        }
    } catch (error) {
        console.error('Error in users endpoint:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch users',
            error: error.message
        });
    }
});

// Get recent loans
app.get('/api/loans/recent', authenticateToken, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 5;
        
        // Try to get data from database first
        try {
            const recentLoans = await Loan.find()
                .populate('borrower', 'fullName email phone')
                .sort({ createdAt: -1 })
                .limit(limit);
                
            return res.json({
                success: true,
                data: recentLoans,
                source: 'database'
            });
        } catch (dbError) {
            console.warn('Database not available, using fallback for recent loans:', dbError);
            
            // Only use fallback if database is not connected
            if (!isConnected) {
                // Fallback to calculated data
                const fallbackLoans = await getFallbackLoanData();
                const recentLoans = fallbackLoans
                    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
                    .slice(0, limit);
                    
                return res.json({
                    success: true,
                    data: recentLoans,
                    source: 'fallback'
                });
            } else {
                return res.status(500).json({
                    success: false,
                    message: 'Failed to fetch recent loans from database',
                    error: dbError.message
                });
            }
        }
    } catch (error) {
        console.error('Error fetching recent loans:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch recent loans',
            error: error.message
        });
    }
});

// Get loan distribution by status
app.get('/api/loans/distribution', authenticateToken, async (req, res) => {
    try {
        // Try to get data from database first
        try {
            const distribution = await Loan.aggregate([
                { $group: { _id: '$status', count: { $sum: 1 } } },
                { $project: { status: '$_id', count: 1, _id: 0 } }
            ]);
            
            return res.json({
                success: true,
                data: distribution,
                source: 'database'
            });
        } catch (dbError) {
            console.warn('Database not available, using fallback for loan distribution:', dbError);
            
            // Only use fallback if database is not connected
            if (!isConnected) {
                // Fallback to calculated data
                const fallbackLoans = await getFallbackLoanData();
                const statusCounts = {};
                
                fallbackLoans.forEach(loan => {
                    const status = loan.status || 'unknown';
                    statusCounts[status] = (statusCounts[status] || 0) + 1;
                });
                
                const distribution = Object.keys(statusCounts).map(status => ({
                    status,
                    count: statusCounts[status]
                }));
                
                return res.json({
                    success: true,
                    data: distribution,
                    source: 'fallback'
                });
            } else {
                return res.status(500).json({
                    success: false,
                    message: 'Failed to fetch loan distribution from database',
                    error: dbError.message
                });
            }
        }
    } catch (error) {
        console.error('Error fetching loan distribution:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch loan distribution',
            error: error.message
        });
    }
});

// Add a new endpoint to get loans directly from database (no fallback)
app.get('/api/loans/database', authenticateToken, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        let limit = parseInt(req.query.limit) || 10;
        
        // If limit is 1000, return all loans without pagination
        const returnAll = limit === 1000;
        
        // For count requests, just return the total count
        if (req.query.countOnly === 'true') {
            const total = await Loan.countDocuments();
            return res.json({
                success: true,
                data: { total },
                source: 'database'
            });
        }

        // Get data from database
        let query = Loan.find().populate('borrower', 'fullName email phone').sort({ createdAt: -1 });
        let countQuery = Loan.countDocuments();
        
        if (!returnAll) {
            const skip = (page - 1) * limit;
            query = query.skip(skip).limit(limit);
        }
        
        const [loans, total] = await Promise.all([query, countQuery]);
        
        return res.json({
            success: true,
            data: {
                loans: loans.map(loan => ({
                    ...loan.toObject(),
                    id: loan._id,
                    borrowerName: loan.borrower?.fullName || 'Unknown',
                    borrowerPhone: loan.borrower?.phone || 'Unknown',
                    borrowerEmail: loan.borrower?.email || ''
                })),
                total,
                page,
                limit: returnAll ? total : limit,
                pages: returnAll ? 1 : Math.ceil(total / limit)
            },
            source: 'database'
        });
    } catch (error) {
        console.error('Error fetching loans:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch loans',
            error: error.message
        });
    }
});

// ===== PAYMENT PROCESSING ENDPOINTS =====

// Search borrowers by phone or name
app.get('/api/borrowers/search', authenticateToken, async (req, res) => {
    try {
        const { phone, name } = req.query;
        let query = {};

        if (phone) {
            // Search by phone number (exact match or partial)
            query.phone = { $regex: phone.toString(), $options: 'i' };
        } else if (name) {
            // Search by name (case insensitive)
            query.fullName = { $regex: name, $options: 'i' };
        } else {
            return res.status(400).json({
                success: false,
                message: 'Please provide either phone or name parameter'
            });
        }

        const borrowers = await Borrower.find(query).limit(10);
        
        res.json({
            success: true,
            borrowers: borrowers
        });
    } catch (error) {
        console.error('Error searching borrowers:', error);
        res.status(500).json({
            success: false,
            message: 'Error searching borrowers',
            error: error.message
        });
    }
});

// Create new borrower
app.post('/api/borrowers', authenticateToken, async (req, res) => {
    try {
        const borrowerData = {
            ...req.body,
            createdBy: req.user.id
        };

        const borrower = new Borrower(borrowerData);
        await borrower.save();

        res.status(201).json({
            success: true,
            message: 'Borrower created successfully',
            borrower: borrower
        });
    } catch (error) {
        console.error('Error creating borrower:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating borrower',
            error: error.message
        });
    }
});

// Get borrowers with pagination
app.get('/api/borrowers', authenticateToken, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const borrowers = await Borrower.find()
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await Borrower.countDocuments();

        res.json({
            success: true,
            borrowers: borrowers,
            total: total,
            page: page,
            pages: Math.ceil(total / limit)
        });
    } catch (error) {
        console.error('Error fetching borrowers:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching borrowers',
            error: error.message
        });
    }
});

// Create new loan
app.post('/api/loans', authenticateToken, async (req, res) => {
    try {
        const loanData = {
            ...req.body,
            createdBy: req.user.id
        };

        const loan = new Loan(loanData);
        await loan.save();

        // Populate borrower information
        await loan.populate('borrower', 'fullName email phone');

        res.status(201).json({
            success: true,
            message: 'Loan created successfully',
            loan: loan
        });
    } catch (error) {
        console.error('Error creating loan:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating loan',
            error: error.message
        });
    }
});

// Get loans for a specific borrower
app.get('/api/loans', authenticateToken, async (req, res) => {
    try {
        const { borrowerId, status } = req.query;
        let query = {};

        if (borrowerId) {
            query.borrower = borrowerId;
        }
        if (status) {
            query.status = status;
        }

        const loans = await Loan.find(query)
            .populate('borrower', 'fullName email phone')
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            loans: loans
        });
    } catch (error) {
        console.error('Error fetching loans:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching loans',
            error: error.message
        });
    }
});

// Create new payment
app.post('/api/payments', authenticateToken, async (req, res) => {
    try {
        const paymentData = {
            ...req.body,
            createdBy: req.user.id
        };

        const payment = new Payment(paymentData);
        await payment.save();

        // Populate loan and borrower information
        await payment.populate({
            path: 'loan',
            populate: {
                path: 'borrower',
                select: 'fullName email phone'
            }
        });

        res.status(201).json({
            success: true,
            message: 'Payment recorded successfully',
            payment: payment
        });
    } catch (error) {
        console.error('Error creating payment:', error);
        res.status(500).json({
            success: false,
            message: 'Error recording payment',
            error: error.message
        });
    }
});

// Get payments with pagination
app.get('/api/payments', authenticateToken, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        const { search, status } = req.query;

        let query = {};
        if (status) {
            query.status = status;
        }

        let payments = await Payment.find(query)
            .populate({
                path: 'loan',
                populate: {
                    path: 'borrower',
                    select: 'fullName email phone'
                }
            })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        // Filter by search term if provided
        if (search) {
            payments = payments.filter(payment => 
                payment.loan?.borrower?.fullName?.toLowerCase().includes(search.toLowerCase()) ||
                payment.loan?.borrower?.phone?.includes(search) ||
                payment.receiptNumber?.toLowerCase().includes(search.toLowerCase())
            );
        }

        const total = await Payment.countDocuments(query);

        // Transform payments for frontend
        const transformedPayments = payments.map(payment => ({
            id: payment._id,
            loanId: payment.loan?._id,
            borrower: {
                id: payment.loan?.borrower?._id,
                name: payment.loan?.borrower?.fullName || 'Unknown'
            },
            paymentNumber: 1, // This would need to be calculated based on payment sequence
            paymentDate: payment.paymentDate,
            dueDate: payment.paymentDate, // This would come from loan schedule
            amountPaid: payment.amount,
            amountDue: payment.amount,
            method: payment.method,
            status: payment.status,
            receiptNumber: payment.receiptNumber,
            notes: payment.notes
        }));

        res.json({
            success: true,
            payments: transformedPayments,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            total: total
        });
    } catch (error) {
        console.error('Error fetching payments:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching payments',
            error: error.message
        });
    }
});

// Reduce loan balance (for payment processing)
app.patch('/api/loans/:loanId/reduce-balance', authenticateToken, async (req, res) => {
    try {
        const { loanId } = req.params;
        const { paidAmount, source } = req.body;

        const loan = await Loan.findById(loanId);
        if (!loan) {
            return res.status(404).json({
                success: false,
                message: 'Loan not found'
            });
        }

        // Calculate new balance (this is a simplified approach)
        // In a real system, you'd have a more complex loan balance calculation
        const currentBalance = loan.amount || 0;
        const newBalance = Math.max(0, currentBalance - paidAmount);

        // Update loan with payment information
        loan.amount = newBalance;
        if (newBalance === 0) {
            loan.status = 'completed';
        }
        
        // Add payment tracking note
        const paymentNote = `Payment of ${paidAmount} processed from ${source}. Balance reduced from ${currentBalance} to ${newBalance}.`;
        loan.notes = loan.notes ? `${loan.notes}\n${paymentNote}` : paymentNote;

        await loan.save();

        res.json({
            success: true,
            message: 'Loan balance updated successfully',
            loan: {
                id: loan._id,
                previousBalance: currentBalance,
                newBalance: newBalance,
                paidAmount: paidAmount,
                status: loan.status
            }
        });
    } catch (error) {
        console.error('Error updating loan balance:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating loan balance',
            error: error.message
        });
    }
});

// Bulk process payments from JSON (main endpoint for payment processing)
app.post('/api/payments/process-json', authenticateToken, async (req, res) => {
    try {
        const { paymentData } = req.body;
        
        if (!paymentData || !Array.isArray(paymentData)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid payment data format'
            });
        }

        const results = {
            processed: 0,
            newUsers: 0,
            matchedUsers: 0,
            errors: [],
            newUsersList: [],
            processedPayments: []
        };

        for (const userPayments of paymentData) {
            try {
                const { phone_number, full_name, total_amount, transactions } = userPayments;
                
                // Find or create borrower
                let borrower = await Borrower.findOne({
                    $or: [
                        { phone: phone_number.toString() },
                        { fullName: { $regex: full_name, $options: 'i' } }
                    ]
                });

                let isNewUser = false;
                if (!borrower) {
                    borrower = new Borrower({
                        fullName: full_name,
                        phone: phone_number.toString(),
                        email: '',
                        address: '',
                        idNumber: '',
                        employmentStatus: 'Unknown',
                        monthlyIncome: 0,
                        isFromPaymentImport: true,
                        importDate: new Date(),
                        createdBy: req.user.id
                    });
                    await borrower.save();
                    isNewUser = true;
                    results.newUsers++;
                    results.newUsersList.push({
                        id: borrower._id,
                        name: full_name,
                        phone: phone_number
                    });
                } else {
                    results.matchedUsers++;
                }

                // Find or create loan
                let loan = await Loan.findOne({
                    borrower: borrower._id,
                    status: { $in: ['active', 'pending', 'approved'] }
                });

                if (!loan) {
                    loan = new Loan({
                        borrower: borrower._id,
                        amount: total_amount * 2, // Estimate original loan amount
                        interestRate: 10,
                        term: 30,
                        purpose: 'Payment Import - Original loan amount estimated',
                        status: 'active',
                        startDate: new Date(),
                        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                        source: 'payment_import',
                        notes: 'Loan created from payment import. Original loan details unknown.',
                        createdBy: req.user.id
                    });
                    await loan.save();
                }

                // Process each transaction
                for (const transaction of transactions) {
                    const payment = new Payment({
                        loan: loan._id,
                        amount: transaction.amount,
                        paymentDate: transaction.date || new Date(),
                        method: 'mobile_money',
                        status: 'completed',
                        notes: `Imported payment - Transaction ID: ${transaction.transaction_id}`,
                        receiptNumber: transaction.transaction_id,
                        isFromImport: true,
                        importDate: new Date(),
                        createdBy: req.user.id
                    });
                    await payment.save();
                    results.processed++;
                    results.processedPayments.push({
                        transactionId: transaction.transaction_id,
                        borrower: full_name,
                        amount: transaction.amount,
                        paymentId: payment._id
                    });
                }

                // Update loan balance
                const currentBalance = loan.amount || 0;
                const newBalance = Math.max(0, currentBalance - total_amount);
                loan.amount = newBalance;
                if (newBalance === 0) {
                    loan.status = 'completed';
                }
                
                const paymentNote = `Payment of ${total_amount} processed from payment import. Balance reduced from ${currentBalance} to ${newBalance}.`;
                loan.notes = loan.notes ? `${loan.notes}\n${paymentNote}` : paymentNote;
                await loan.save();

            } catch (error) {
                console.error(`Error processing payments for ${userPayments.full_name}:`, error);
                results.errors.push({
                    user: userPayments.full_name,
                    phone: userPayments.phone_number,
                    error: error.message
                });
            }
        }

        res.json({
            success: true,
            message: 'Payment processing completed',
            results: results
        });

    } catch (error) {
        console.error('Error in bulk payment processing:', error);
        res.status(500).json({
            success: false,
            message: 'Error processing payments',
            error: error.message
        });
    }
});

// Manual trigger for payment processing
app.post('/api/payments/process-startup', authenticateToken, async (req, res) => {
    try {
        // Check if user is admin
        if (req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Only administrators can trigger payment processing'
            });
        }

        await processPaymentDataOnStartup();
        
        res.json({
            success: true,
            message: 'Payment processing completed successfully'
        });
    } catch (error) {
        console.error('Error in manual payment processing:', error);
        res.status(500).json({
            success: false,
            message: 'Error processing payments',
            error: error.message
        });
    }
});

// ===== END PAYMENT PROCESSING ENDPOINTS =====

// Function to automatically process payment data on server start
async function processPaymentDataOnStartup() {
    try {
        // Check if payments have already been processed
        const existingPayments = await Payment.countDocuments({ isFromImport: true });
        if (existingPayments > 0) {
            console.log(`Found ${existingPayments} imported payments. Skipping automatic import.`);
            return;
        }

        console.log('Loading payment data from payment.json...');
        
        // Load payment data from JSON file
        const paymentDataPath = path.join(__dirname, 'data', 'payments', 'payment.json');
        if (!fs.existsSync(paymentDataPath)) {
            console.log('Payment data file not found. Skipping automatic import.');
            return;
        }

        const paymentData = JSON.parse(fs.readFileSync(paymentDataPath, 'utf8'));
        
        if (!paymentData || paymentData.length === 0) {
            console.log('No payment data found in payment.json');
            return;
        }

        console.log(`Processing ${paymentData.length} payment records...`);

        let processed = 0;
        let newUsers = 0;
        let matchedUsers = 0;
        let errors = 0;

        for (const userPayments of paymentData) {
            try {
                const { phone_number, full_name, total_amount, transactions } = userPayments;
                
                // Find or create borrower
                let borrower = await Borrower.findOne({
                    $or: [
                        { phone: phone_number.toString() },
                        { fullName: { $regex: full_name, $options: 'i' } }
                    ]
                });

                if (!borrower) {
                    borrower = new Borrower({
                        fullName: full_name,
                        phone: phone_number.toString(),
                        email: '',
                        address: '',
                        idNumber: '',
                        employmentStatus: 'Unknown',
                        monthlyIncome: 0,
                        isFromPaymentImport: true,
                        importDate: new Date()
                    });
                    await borrower.save();
                    newUsers++;
                } else {
                    matchedUsers++;
                }

                // Find or create loan
                let loan = await Loan.findOne({
                    borrower: borrower._id,
                    status: { $in: ['active', 'pending', 'approved'] }
                });

                if (!loan) {
                    loan = new Loan({
                        borrower: borrower._id,
                        amount: total_amount * 2, // Estimate original loan amount
                        interestRate: 10,
                        term: 30,
                        purpose: 'Payment Import - Original loan amount estimated',
                        status: 'active',
                        startDate: new Date(),
                        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                        source: 'payment_import',
                        notes: 'Loan created from payment import. Original loan details unknown.'
                    });
                    await loan.save();
                }

                // Process each transaction
                for (const transaction of transactions) {
                    const payment = new Payment({
                        loan: loan._id,
                        amount: transaction.amount,
                        paymentDate: transaction.date || new Date(),
                        method: 'mobile_money',
                        status: 'completed',
                        notes: `Imported payment - Transaction ID: ${transaction.transaction_id}`,
                        receiptNumber: transaction.transaction_id,
                        isFromImport: true,
                        importDate: new Date()
                    });
                    await payment.save();
                    processed++;
                }

                // Update loan balance
                const currentBalance = loan.amount || 0;
                const newBalance = Math.max(0, currentBalance - total_amount);
                loan.amount = newBalance;
                if (newBalance === 0) {
                    loan.status = 'completed';
                }
                
                const paymentNote = `Payment of ${total_amount} processed from automatic import. Balance reduced from ${currentBalance} to ${newBalance}.`;
                loan.notes = loan.notes ? `${loan.notes}\n${paymentNote}` : paymentNote;
                await loan.save();

            } catch (error) {
                console.error(`Error processing payments for ${userPayments.full_name}:`, error);
                errors++;
            }
        }

        console.log(`Payment processing completed! Processed: ${processed}, New users: ${newUsers}, Matched users: ${matchedUsers}, Errors: ${errors}`);

    } catch (error) {
        console.error('Error in automatic payment processing:', error);
    }
}

// Start the server without importing data
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    
    // Wait for database connection before trying to count documents
    setTimeout(async () => {
        if (isConnected) {
            try {
                const loanCount = await Loan.countDocuments();
                const borrowerCount = await Borrower.countDocuments();
                const paymentCount = await Payment.countDocuments();
                console.log(`Connected to database. Found ${loanCount} loans, ${borrowerCount} borrowers, and ${paymentCount} payments.`);
                
                // Process payment data automatically if not already done
                await processPaymentDataOnStartup();
                
                // Show updated counts
                const newLoanCount = await Loan.countDocuments();
                const newBorrowerCount = await Borrower.countDocuments();
                const newPaymentCount = await Payment.countDocuments();
                console.log(`After processing: ${newLoanCount} loans, ${newBorrowerCount} borrowers, and ${newPaymentCount} payments.`);
                
            } catch (error) {
                console.error('Error counting documents:', error);
            }
        } else {
            console.log('Database not connected. Using fallback data if needed.');
        }
    }, 5000); // Wait 5 seconds for connection to stabilize
});

// Reports API endpoint
app.get('/api/reports', authenticateToken, async (req, res) => {
    try {
        const { type, startDate, endDate } = req.query;
        
        let reportData = {};
        
        switch (type) {
            case 'loan_summary':
                reportData = await generateLoanSummaryReport(startDate, endDate);
                break;
            case 'payment_history':
                reportData = await generatePaymentHistoryReport(startDate, endDate);
                break;
            case 'user_activity':
                reportData = await generateUserActivityReport(startDate, endDate);
                break;
            case 'overdue_loans':
                reportData = await generateOverdueLoansReport(startDate, endDate);
                break;
            case 'disbursement_report':
                reportData = await generateDisbursementReport(startDate, endDate);
                break;
            default:
                reportData = await generateLoanSummaryReport(startDate, endDate);
        }
        
        res.json(reportData);
    } catch (error) {
        console.error('Error generating report:', error);
        res.status(500).json({ message: 'Error generating report', error: error.message });
    }
});

// Report generation functions
async function generateLoanSummaryReport(startDate, endDate) {
    try {
        const loans = await Loan.find({
            createdAt: {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            }
        }).populate('borrower');
        
        const totalLoans = loans.length;
        const totalAmount = loans.reduce((sum, loan) => sum + loan.amount, 0);
        const activeLoans = loans.filter(loan => loan.status === 'active').length;
        const completedLoans = loans.filter(loan => loan.status === 'completed').length;
        
        return {
            summary: {
                totalLoans,
                totalAmount,
                activeLoans,
                completedLoans,
                averageLoanAmount: totalLoans > 0 ? totalAmount / totalLoans : 0
            },
            loans: loans.map(loan => ({
                id: loan._id,
                borrower: loan.borrower.fullName,
                amount: loan.amount,
                status: loan.status,
                createdAt: loan.createdAt
            }))
        };
    } catch (error) {
        console.error('Error generating loan summary report:', error);
        return { summary: {}, loans: [] };
    }
}

async function generatePaymentHistoryReport(startDate, endDate) {
    try {
        const payments = await Payment.find({
            paymentDate: {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            }
        }).populate({
            path: 'loan',
            populate: {
                path: 'borrower'
            }
        });
        
        const totalPayments = payments.length;
        const totalAmount = payments.reduce((sum, payment) => sum + payment.amount, 0);
        
        return {
            summary: {
                totalPayments,
                totalAmount,
                averagePayment: totalPayments > 0 ? totalAmount / totalPayments : 0
            },
            payments: payments.map(payment => ({
                id: payment._id,
                loanId: payment.loan._id,
                borrower: payment.loan.borrower.fullName,
                amount: payment.amount,
                method: payment.method,
                paymentDate: payment.paymentDate,
                status: payment.status
            }))
        };
    } catch (error) {
        console.error('Error generating payment history report:', error);
        return { summary: {}, payments: [] };
    }
}

async function generateUserActivityReport(startDate, endDate) {
    try {
        const users = await User.find({
            lastLogin: {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            }
        });
        
        return {
            summary: {
                activeUsers: users.length,
                totalSessions: users.reduce((sum, user) => sum + user.sessions.length, 0)
            },
            users: users.map(user => ({
                id: user._id,
                fullName: user.fullName,
                role: user.role,
                lastLogin: user.lastLogin,
                sessionCount: user.sessions.length
            }))
        };
    } catch (error) {
        console.error('Error generating user activity report:', error);
        return { summary: {}, users: [] };
    }
}

async function generateOverdueLoansReport(startDate, endDate) {
    try {
        const overdueLoans = await Loan.find({
            status: 'active',
            endDate: { $lt: new Date() }
        }).populate('borrower');
        
        const totalOverdue = overdueLoans.length;
        const totalOverdueAmount = overdueLoans.reduce((sum, loan) => sum + loan.amount, 0);
        
        return {
            summary: {
                totalOverdue,
                totalOverdueAmount
            },
            loans: overdueLoans.map(loan => ({
                id: loan._id,
                borrower: loan.borrower.fullName,
                amount: loan.amount,
                endDate: loan.endDate,
                daysOverdue: Math.floor((new Date() - loan.endDate) / (1000 * 60 * 60 * 24))
            }))
        };
    } catch (error) {
        console.error('Error generating overdue loans report:', error);
        return { summary: {}, loans: [] };
    }
}

async function generateDisbursementReport(startDate, endDate) {
    try {
        const disbursements = await Loan.find({
            disbursementDate: {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            },
            status: { $in: ['active', 'completed', 'disbursed'] }
        }).populate('borrower');
        
        const totalDisbursements = disbursements.length;
        const totalAmount = disbursements.reduce((sum, loan) => sum + loan.amount, 0);
        
        return {
            summary: {
                totalDisbursements,
                totalAmount,
                averageDisbursement: totalDisbursements > 0 ? totalAmount / totalDisbursements : 0
            },
            disbursements: disbursements.map(loan => ({
                id: loan._id,
                borrower: loan.borrower.fullName,
                amount: loan.amount,
                disbursementDate: loan.disbursementDate,
                disbursementMethod: loan.disbursementMethod,
                status: loan.status
            }))
        };
    } catch (error) {
        console.error('Error generating disbursement report:', error);
        return { summary: {}, disbursements: [] };
    }
}

// Enhanced users endpoint to show connected users with device details
app.get('/api/users/connected', authenticateToken, async (req, res) => {
    try {
        const connectedUsers = await User.find({
            'sessions.isActive': true,
            'sessions.expiresAt': { $gt: new Date() }
        }).select('fullName email role sessions lastLogin');
        
        const userDetails = connectedUsers.map(user => {
            const activeSessions = user.sessions.filter(session => 
                session.isActive && session.expiresAt > new Date()
            );
            
            return {
                id: user._id,
                name: user.fullName,
                email: user.email,
                role: user.role,
                lastLogin: user.lastLogin,
                deviceDetails: activeSessions.map(session => ({
                    userAgent: session.userAgent,
                    ipAddress: session.ipAddress,
                    lastActivity: session.lastActivity,
                    deviceType: getDeviceType(session.userAgent),
                    operatingSystem: getOperatingSystem(session.userAgent)
                }))
            };
        });
        
        res.json({
            success: true,
            connectedUsers: userDetails,
            totalConnected: userDetails.length
        });
    } catch (error) {
        console.error('Error fetching connected users:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching connected users', 
            error: error.message 
        });
    }
});

// Helper functions for device detection
function getDeviceType(userAgent) {
    if (!userAgent) return 'Unknown';
    
    if (/Mobile|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)) {
        return 'Mobile';
    } else if (/Tablet|iPad/i.test(userAgent)) {
        return 'Tablet';
    } else {
        return 'Desktop';
    }
}

function getOperatingSystem(userAgent) {
    if (!userAgent) return 'Unknown';
    
    if (/Windows NT/i.test(userAgent)) return 'Windows';
    if (/Mac OS X/i.test(userAgent)) return 'macOS';
    if (/Linux/i.test(userAgent)) return 'Linux';
    if (/Android/i.test(userAgent)) return 'Android';
    if (/iPhone|iPad|iPod/i.test(userAgent)) return 'iOS';
    
    return 'Unknown';
}

module.exports = app;
