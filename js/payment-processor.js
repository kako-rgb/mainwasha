// Payment Processor Module for JSON Payment Data
// This module processes payments from the payment.json file and updates the database

class PaymentProcessor {
    constructor() {
        this.processedPayments = [];
        this.newUsers = [];
        this.matchedUsers = [];
        this.errors = [];
        this.API_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000/api' : '/api';
        this.setupEventListeners();
    }

    setupEventListeners() {
        const processJsonBtn = document.getElementById('process-json-payments-btn');
        const jsonFileInput = document.getElementById('json-file-input');
        
        // Create file input if it doesn't exist
        if (!jsonFileInput) {
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = '.json';
            fileInput.id = 'json-file-input';
            fileInput.style.display = 'none';
            document.body.appendChild(fileInput);
        }

        if (processJsonBtn) {
            processJsonBtn.addEventListener('click', () => {
                document.getElementById('json-file-input').click();
            });

            document.getElementById('json-file-input').addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    this.processPaymentsFromJSON(e.target.files[0]);
                }
            });
        }
    }

    // Set up event listeners for JSON payment processing
    setupEventListeners() {
        const processJsonBtn = document.getElementById('process-json-payments-btn');
        if (processJsonBtn) {
            processJsonBtn.addEventListener('click', () => this.processPaymentsFromJSON());
        }
    }

    // Main function to process all payments from uploaded JSON
    async processPaymentsFromJSON() {
        try {
            // Show file upload dialog
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = '.json';
            
            const filePromise = new Promise((resolve, reject) => {
                fileInput.onchange = async (e) => {
                    const file = e.target.files[0];
                    if (!file) {
                        reject(new Error('No file selected'));
                        return;
                    }
                    
                    try {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                            try {
                                const data = JSON.parse(event.target.result);
                                resolve(data);
                            } catch (error) {
                                reject(new Error('Invalid JSON file'));
                            }
                        };
                        reader.onerror = () => reject(new Error('Error reading file'));
                        reader.readAsText(file);
                    } catch (error) {
                        reject(error);
                    }
                };
                
                fileInput.click();
            });

            // Show loading notification
            app.showNotification('Starting payment processing...', 'info');
            
            // Load payment data from uploaded file
            const paymentData = await filePromise;
            
            if (!paymentData || !Array.isArray(paymentData) || paymentData.length === 0) {
                throw new Error('No valid payment data found in uploaded file');
            }

            // Process in chunks to avoid large payloads
            const chunkSize = 50;
            for (let i = 0; i < paymentData.length; i += chunkSize) {
                const chunk = paymentData.slice(i, i + chunkSize);
                await this.processPaymentChunk(chunk);
            }

            // Process each user's payments
            for (const userPayments of paymentData) {
                await this.processUserPayments(userPayments);
            }

            // Show results
            this.showProcessingResults();
            
            // Refresh the payments table
            if (typeof loadPayments === 'function') {
                loadPayments();
            }

        } catch (error) {
            console.error('Error processing payments:', error);
            app.showNotification(`Error processing payments: ${error.message}`, 'error');
        }
    }

    // Load payment data from uploaded JSON file
    async loadPaymentData() {
        try {
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = '.json';
            
            return new Promise((resolve, reject) => {
                fileInput.onchange = async (e) => {
                    const file = e.target.files[0];
                    if (!file) {
                        reject(new Error('No file selected'));
                        return;
                    }
                    
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        try {
                            const data = JSON.parse(event.target.result);
                            resolve(this.transformPaymentData(data));
                        } catch (error) {
                            reject(new Error('Invalid JSON file'));
                        }
                    };
                    reader.onerror = () => reject(new Error('Error reading file'));
                    reader.readAsText(file);
                };
                
                fileInput.click();
            });
        } catch (error) {
            console.error('Error loading payment data:', error);
            throw error;
        }
    }

    // Transform payment data to use shorter IDs
    transformPaymentData(data) {
        return data.map((item) => ({
            ...item,
            id: item.id || app.generateId.payment(),
            transactions: item.transactions.map(tx => ({
                ...tx,
                transaction_id: tx.transaction_id || app.generateId.payment()
            }))
        }));
    }

    // Process a chunk of payments
    async processPaymentChunk(paymentChunk) {
        try {
            // Group payments by borrower phone/name
            const groupedPayments = this.groupPaymentsByBorrower(paymentChunk);
            
            const response = await fetch(`${this.API_URL}/payments/process-json`, {
                method: 'POST',
                headers: {
                    ...auth.getAuthHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    paymentData: paymentChunk,
                    groupedPayments: groupedPayments
                })
            });

            if (!response.ok) {
                throw new Error(`Server returned ${response.status}`);
            }

            const result = await response.json();
            this.processedPayments.push(...result.processedPayments);
            this.newUsers.push(...result.newUsers);
            this.matchedUsers.push(...result.matchedUsers);
        } catch (error) {
            console.error('Error processing payment chunk:', error);
            throw error;
        }
    }

    // Process payments for a single user (legacy, kept for backward compatibility)
    async processUserPayments(userPayments) {
        try {
            const { phone_number, full_name, total_amount, transactions } = userPayments;
            
            // Find or create borrower
            const borrower = await this.findOrCreateBorrower(phone_number, full_name);
            
            // Find or create loan for this borrower
            const loan = await this.findOrCreateLoan(borrower, total_amount);
            
            // Process each transaction
            for (const transaction of transactions) {
                await this.processTransaction(loan, borrower, transaction);
            }

            // Update loan balance
            await this.updateLoanBalance(loan._id, total_amount);

        } catch (error) {
            console.error(`Error processing payments for ${full_name}:`, error);
            this.errors.push({
                user: full_name,
                phone: phone_number,
                error: error.message
            });
        }
    }

    // Find existing borrower or create new one
    async findOrCreateBorrower(phoneNumber, fullName) {
        try {
            // First try to find by phone number
            let borrower = await this.findBorrowerByPhone(phoneNumber);
            
            if (!borrower) {
                // Try to find by name
                borrower = await this.findBorrowerByName(fullName);
            }

            if (!borrower) {
                // Create new borrower
                borrower = await this.createNewBorrower(phoneNumber, fullName);
                this.newUsers.push({
                    id: borrower._id,
                    name: fullName,
                    phone: phoneNumber,
                    isNew: true
                });
            } else {
                this.matchedUsers.push({
                    id: borrower._id,
                    name: fullName,
                    phone: phoneNumber,
                    isNew: false
                });
            }

            return borrower;
        } catch (error) {
            console.error('Error finding/creating borrower:', error);
            throw error;
        }
    }

    // Find borrower by phone number
    async findBorrowerByPhone(phoneNumber) {
        try {
            const response = await fetch(`${this.API_URL}/borrowers/search?phone=${phoneNumber}`, {
                method: 'GET',
                headers: auth.getAuthHeaders()
            });

            if (response.ok) {
                const data = await response.json();
                return data.borrowers && data.borrowers.length > 0 ? data.borrowers[0] : null;
            }
            return null;
        } catch (error) {
            console.error('Error finding borrower by phone:', error);
            return null;
        }
    }

    // Find borrower by name
    async findBorrowerByName(fullName) {
        try {
            const response = await fetch(`${this.API_URL}/borrowers/search?name=${encodeURIComponent(fullName)}`, {
                method: 'GET',
                headers: auth.getAuthHeaders()
            });

            if (response.ok) {
                const data = await response.json();
                return data.borrowers && data.borrowers.length > 0 ? data.borrowers[0] : null;
            }
            return null;
        } catch (error) {
            console.error('Error finding borrower by name:', error);
            return null;
        }
    }

    // Create new borrower
    async createNewBorrower(phoneNumber, fullName) {
        try {
            const borrowerData = {
                fullName: fullName,
                phone: phoneNumber.toString(),
                email: '', // Will be updated later if needed
                address: '',
                idNumber: '',
                employmentStatus: 'Unknown',
                monthlyIncome: 0,
                isFromPaymentImport: true, // Flag to identify imported users
                importDate: new Date().toISOString()
            };

            const response = await fetch(`${this.API_URL}/borrowers`, {
                method: 'POST',
                headers: {
                    ...auth.getAuthHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(borrowerData)
            });

            if (!response.ok) {
                throw new Error('Failed to create borrower');
            }

            const data = await response.json();
            return data.borrower;
        } catch (error) {
            console.error('Error creating borrower:', error);
            throw error;
        }
    }

    // Find or create loan for borrower
    async findOrCreateLoan(borrower, totalAmount) {
        try {
            // First try to find existing active loan
            let loan = await this.findActiveLoan(borrower._id);

            if (!loan) {
                // Create new loan
                loan = await this.createNewLoan(borrower, totalAmount);
            }

            return loan;
        } catch (error) {
            console.error('Error finding/creating loan:', error);
            throw error;
        }
    }

    // Find active loan for borrower
    async findActiveLoan(borrowerId) {
        try {
            const response = await fetch(`${this.API_URL}/loans?borrowerId=${borrowerId}&status=active`, {
                method: 'GET',
                headers: auth.getAuthHeaders()
            });

            if (response.ok) {
                const data = await response.json();
                return data.loans && data.loans.length > 0 ? data.loans[0] : null;
            }
            return null;
        } catch (error) {
            console.error('Error finding active loan:', error);
            return null;
        }
    }

    // Create new loan
    async createNewLoan(borrower, totalAmount) {
        try {
            const loanData = {
                id: app.generateId.loan(),
                borrower: borrower._id,
                amount: totalAmount * 2,
                interestRate: 10,
                term: 30,
                purpose: 'Payment Import - Original loan amount estimated',
                status: 'active',
                startDate: new Date().toISOString(),
                endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                source: 'payment_import',
                notes: 'Loan created from payment import'
            };

            const response = await fetch(`${this.API_URL}/loans`, {
                method: 'POST',
                headers: {
                    ...auth.getAuthHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(loanData)
            });

            if (!response.ok) {
                throw new Error('Failed to create loan');
            }

            return await response.json();
        } catch (error) {
            console.error('Error creating loan:', error);
            throw error;
        }
    }

    // Group payments by borrower identifier (phone or name)
    groupPaymentsByBorrower(payments) {
        const grouped = new Map();
        
        for (const payment of payments) {
            const key = payment.phone_number || payment.full_name;
            if (!key) {
                this.errors.push({
                    payment: payment,
                    error: 'Missing both phone number and name'
                });
                continue;
            }

            if (!grouped.has(key)) {
                grouped.set(key, {
                    phone_number: payment.phone_number,
                    full_name: payment.full_name,
                    total_amount: 0,
                    transactions: []
                });
            }

            const group = grouped.get(key);
            group.total_amount += parseFloat(payment.total_amount || 0);
            if (payment.transactions) {
                group.transactions.push(...payment.transactions);
            }
        }

        return Array.from(grouped.values());
    }

    // Process a single transaction and update payment history
    async processTransaction(loan, borrower, transaction) {
        try {
            const paymentData = {
                loan_id: loan._id,
                borrower_id: borrower._id,
                amount: transaction.amount,
                payment_date: transaction.date || new Date(),
                transaction_id: transaction.transaction_id,
                payment_method: transaction.payment_method || 'json_upload',
                notes: transaction.notes || 'Processed from JSON upload'
            };

            const response = await fetch(`${this.API_URL}/payments`, {
                method: 'POST',
                headers: {
                    ...auth.getAuthHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(paymentData)
            });

            if (!response.ok) {
                throw new Error(`Payment processing failed: ${response.statusText}`);
            }

            const result = await response.json();
            this.processedPayments.push({
                ...paymentData,
                status: 'success',
                payment_id: result.payment_id
            });

        } catch (error) {
            console.error('Error processing transaction:', error);
            this.errors.push({
                transaction: transaction,
                error: error.message
            });
        }
    }

    // Update loan balance after payment
    async updateLoanBalance(loanId, paymentAmount) {
        try {
            const response = await fetch(`${this.API_URL}/loans/${loanId}/balance`, {
                method: 'POST',
                headers: {
                    ...auth.getAuthHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    payment_amount: paymentAmount,
                    update_date: new Date()
                })
            });

            if (!response.ok) {
                throw new Error(`Failed to update loan balance: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error updating loan balance:', error);
            this.errors.push({
                loan_id: loanId,
                error: `Failed to update loan balance: ${error.message}`
            });
        }
    }

    // Show processing results in a centered modal
    showProcessingResults() {
        const totalProcessed = this.processedPayments.length;
        const newUsersCount = this.newUsers.length;
        const matchedUsersCount = this.matchedUsers.length;
        const errorsCount = this.errors.length;

        // Create results modal
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Payment Processing Results</h2>
                    <button class="close-btn" id="close-results" style="cursor: pointer;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="results-summary">
                        <div class="result-item">
                            <span class="result-label">Total Processed:</span>
                            <span class="result-value">${totalProcessed}</span>
                        </div>
                        <div class="result-item">
                            <span class="result-label">Successfully Updated:</span>
                            <span class="result-value highlight-success">${matchedUsersCount}</span>
                        </div>
                        <div class="result-item">
                            <span class="result-label">New Users Created:</span>
                            <span class="result-value highlight-new">${newUsersCount}</span>
                        </div>
                        <div class="result-item">
                            <span class="result-label">Errors:</span>
                            <span class="result-value ${errorsCount > 0 ? 'highlight-error' : ''}">${errorsCount}</span>
                        </div>
                    </div>

                    ${newUsersCount > 0 ? `
                        <div class="new-users-section">
                            <h4>New Users Created</h4>
                            ${this.newUsers.map(user => `
                                <div class="user-item new-user">
                                    <span>${user.name || user.phone}</span>
                                    <span class="new-badge">NEW</span>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}

                    ${errorsCount > 0 ? `
                        <div class="errors-section">
                            <h4>Errors</h4>
                            ${this.errors.map(error => `
                                <div class="error-item">
                                    <span class="error-message">${error}</span>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-primary" onclick="window.location.reload()">Refresh</button>
                    <button type="button" class="btn btn-secondary" id="close-results-btn">Close</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Setup close buttons
        ['close-results', 'close-results-btn'].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) {
                btn.onclick = () => modal.remove();
            }
        });

        // Close when clicking outside
        modal.onclick = (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        };

        // Show summary notification
        const message = `Processing completed! Processed: ${totalProcessed}, Updated: ${matchedUsersCount}, New: ${newUsersCount}, Errors: ${errorsCount}`;
        app.showNotification(message, errorsCount > 0 ? 'warning' : 'success');
    }

    // Show payment activity in loan view
    async showPaymentActivityHistory(loanId, payments) {
        const activityContainer = document.createElement('div');
        activityContainer.className = 'loan-activity-container';

        const header = document.createElement('div');
        header.className = 'loan-activity-header';
        header.innerHTML = '<h3>Payment Activity History</h3>';

        const activityList = document.createElement('ul');
        activityList.className = 'loan-activity-list';

        // Sort payments by date in descending order
        payments.sort((a, b) => new Date(b.payment_date) - new Date(a.payment_date));

        payments.forEach(payment => {
            const activityItem = document.createElement('li');
            activityItem.className = 'loan-activity-item';
            
            const formattedDate = new Date(payment.payment_date).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });

            const formattedAmount = this.formatCurrency(payment.amount);
            const paymentMethod = payment.payment_method.replace('_', ' ').toLowerCase();

            activityItem.innerHTML = `
                <span class="loan-activity-date">${formattedDate}</span>
                <div class="loan-activity-details">
                    <span class="loan-activity-type">Payment Received</span>
                    <span class="loan-activity-description">
                        Via ${paymentMethod}
                        ${payment.notes ? `<br><small>${payment.notes}</small>` : ''}
                    </span>
                </div>
                <span class="loan-activity-amount payment">+${formattedAmount}</span>
            `;

            activityList.appendChild(activityItem);
        });

        activityContainer.appendChild(header);
        activityContainer.appendChild(activityList);

        // Insert the activity history in the loan view
        const loanView = document.querySelector('.loan-details');
        if (loanView) {
            const existingHistory = document.querySelector('.loan-activity-container');
            if (existingHistory) {
                existingHistory.remove();
            }
            loanView.insertAdjacentElement('afterend', activityContainer);
        }
    }

    // Refresh payment activity display
    async refreshPaymentActivity(loanId) {
        try {
            const response = await fetch(`${this.API_URL}/loans/${loanId}/payments`, {
                method: 'GET',
                headers: auth.getAuthHeaders()
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch payment history: ${response.statusText}`);
            }

            const data = await response.json();
            if (data.payments && data.payments.length > 0) {
                await this.showPaymentActivityHistory(loanId, data.payments);
            }
        } catch (error) {
            console.error('Error refreshing payment activity:', error);
            app.showNotification('Failed to refresh payment activity', 'error');
        }
    }
}

// Create global instance
window.paymentProcessor = new PaymentProcessor();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PaymentProcessor;
}
