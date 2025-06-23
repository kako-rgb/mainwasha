// Payment Processing Module

// Global variables
let payments = [];
let currentPage = 1;
let totalPages = 1;
let searchTerm = '';
let statusFilter = '';
let currentDateFilter = ''; // For date filtering
let selectedLoanId = null;
let selectedPaymentNumber = null;

// Initialize payment processing when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    if (window.location.pathname.includes('payment-processing.html')) {
        initializePaymentProcessing();
    }
});

// Initialize payment processing page
function initializePaymentProcessing() {
    setupPaymentEventListeners();
    
    // Check if specific loan payment was requested
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('loanId') && urlParams.has('paymentNumber')) {
        selectedLoanId = urlParams.get('loanId');
        selectedPaymentNumber = urlParams.get('paymentNumber');
        
        // Open payment modal for the selected loan payment
        loadSpecificPayment(selectedLoanId, selectedPaymentNumber);
    } else {
        // Load all payments
        loadPayments();
    }
}

// Setup event listeners for payment processing
function setupPaymentEventListeners() {
    // Record payment button
    const recordPaymentBtn = document.getElementById('record-payment-btn');
    if (recordPaymentBtn) {
        recordPaymentBtn.addEventListener('click', () => {
            openPaymentModal();
        });
    }
    
    // Process JSON payments button
    const processJsonBtn = document.getElementById('process-json-payments-btn');
    if (processJsonBtn) {
        processJsonBtn.addEventListener('click', (e) => {
            e.preventDefault();
            processJsonPayments();
        });
    }
    
    // Payment form submission
    const paymentForm = document.getElementById('payment-form');
    if (paymentForm) {
        paymentForm.addEventListener('submit', (e) => {
            e.preventDefault();
            savePayment();
        });
    }
    
    // Cancel payment form
    const cancelPaymentForm = document.getElementById('cancel-payment-form');
    if (cancelPaymentForm) {
        cancelPaymentForm.addEventListener('click', () => {
            closePaymentModal();
        });
    }
    
    // Close payment modal
    const closeModal = document.getElementById('close-payment-modal');
    if (closeModal) {
        closeModal.addEventListener('click', () => {
            closePaymentModal();
        });
    }
    
    // Search functionality
    const searchInput = document.getElementById('payment-search');
    const searchBtn = document.getElementById('search-btn');
    
    if (searchInput && searchBtn) {
        // Real-time search as user types
        let searchTimeout;
        searchInput.addEventListener('input', () => {
            // Clear previous timeout to avoid excessive API calls
            clearTimeout(searchTimeout);
            
            // Add visual feedback that search is active
            searchInput.classList.add('searching');
            
            // Set a small delay to wait for user to finish typing
            searchTimeout = setTimeout(() => {
                searchTerm = searchInput.value.trim();
                currentPage = 1;
                loadPayments();
                
                // Remove searching class after search completes
                setTimeout(() => {
                    searchInput.classList.remove('searching');
                }, 100);
            }, 300); // 300ms delay
        });
        
        // Keep existing search button functionality
        searchBtn.addEventListener('click', () => {
            searchTerm = searchInput.value.trim();
            currentPage = 1;
            loadPayments();
        });
        
        // Keep existing Enter key functionality
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                // Clear timeout and search immediately
                clearTimeout(searchTimeout);
                searchTerm = searchInput.value.trim();
                currentPage = 1;
                loadPayments();
            }
        });
    }
    
    // Status filter
    const statusFilterSelect = document.getElementById('status-filter');
    if (statusFilterSelect) {
        statusFilterSelect.addEventListener('change', () => {
            statusFilter = statusFilterSelect.value;
            currentPage = 1;
            loadPayments();
        });
    }
    
    // Date filter
    const dateFilter = document.getElementById('date-filter');
    if (dateFilter) {
        dateFilter.addEventListener('change', (e) => {
            const selectedDate = e.target.value;
            filterPaymentsByDate(selectedDate);
        });
    }
    
    // Pagination
    const prevPageBtn = document.getElementById('prev-page');
    const nextPageBtn = document.getElementById('next-page');
    
    if (prevPageBtn && nextPageBtn) {
        prevPageBtn.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                loadPayments();
            }
        });
        
        nextPageBtn.addEventListener('click', () => {
            if (currentPage < totalPages) {
                currentPage++;
                loadPayments();
            }
        });
    }
    
    // CSV import
    const importCsvBtn = document.getElementById('import-csv-btn');
    const csvFileInput = document.getElementById('csv-file');
    
    if (importCsvBtn && csvFileInput) {
        importCsvBtn.addEventListener('click', () => {
            csvFileInput.click();
        });
        
        csvFileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                importPaymentsFromCsv(e.target.files[0]);
            }
        });
    }
    
    // JSON payment processing
    const processJsonPaymentsBtn = document.getElementById('process-json-payments-btn');
    if (processJsonPaymentsBtn) {
        processJsonPaymentsBtn.addEventListener('click', () => {
            processJsonPayments();
        });
    }
}

// Load payments from API
function loadPayments() {
    const paymentsTable = document.getElementById('recent-payments-table');
    if (!paymentsTable) {
        console.error('Payments table not found');
        return;
    }
    
    const tableBody = paymentsTable.querySelector('tbody');
    const paginationInfo = document.getElementById('pagination-info');
    const prevPageBtn = document.getElementById('prev-page');
    const nextPageBtn = document.getElementById('next-page');
    
    if (!tableBody) {
        console.error('Table body not found');
        return;
    }
    
    // Show loading state
    tableBody.innerHTML = '<tr><td colspan="8" class="loading-message">Loading payments...</td></tr>';
    
    // Build query parameters
    const queryParams = new URLSearchParams();
    queryParams.append('page', currentPage);
    queryParams.append('limit', 10);
    
    if (searchTerm) {
        queryParams.append('search', searchTerm);
    }
    
    if (statusFilter) {
        queryParams.append('status', statusFilter);
    }
    
    // Add date filter if set
    if (currentDateFilter) {
        // Format date to YYYY-MM-DD for the API
        const formattedDate = new Date(currentDateFilter).toISOString().split('T')[0];
        queryParams.append('date', formattedDate);
    }
    
    // Fetch payments from API
    fetch(`${API_URL}/payments?${queryParams.toString()}`, {
        method: 'GET',
        headers: auth.getAuthHeaders()
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to load payments');
        }
        return response.json();
    })
    .then(data => {
        payments = data.payments || data.items || [];
        totalPages = data.totalPages || 1;
        
        // Sort payments by borrower name (alphabetically)
        if (payments.length > 0 && payments[0].borrower) {
            payments.sort((a, b) => {
                const nameA = typeof a.borrower === 'string' ? a.borrower : a.borrower.name || '';
                const nameB = typeof b.borrower === 'string' ? b.borrower : b.borrower.name || '';
                return nameA.localeCompare(nameB);
            });
        }
        
        // Update pagination
        paginationInfo.textContent = `Page ${currentPage} of ${totalPages}`;
        prevPageBtn.disabled = currentPage <= 1;
        nextPageBtn.disabled = currentPage >= totalPages;
        
        // Render payments
        renderPayments(tableBody);
    })
    .catch(error => {
        console.error('Error loading payments:', error);
        tableBody.innerHTML = `<tr><td colspan="8" class="error-message">Error loading payments: ${error.message}</td></tr>`;
        // Fallback: Load mock payments if API fails
        loadMockPayments();
    });
}

// Filter payments by date
function filterPaymentsByDate(date) {
    currentDateFilter = date;
    currentPage = 1; // Reset to first page when changing date filter
    loadPayments();
}

// Load specific payment for processing
function loadSpecificPayment(loanId, paymentNumber) {
    // Fetch payment details from API
    fetch(`${API_URL}/loans/${loanId}/payments/${paymentNumber}`, {
        method: 'GET',
        headers: auth.getAuthHeaders()
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to load payment details');
        }
        return response.json();
    })
    .then(data => {
        const payment = data.payment;
        openPaymentModal(payment);
    })
    .catch(error => {
        console.error('Error loading payment details:', error);
        app.showNotification(`Error: ${error.message}`, 'error');
        
        // For development/demo purposes, create mock payment
        const mockPayment = {
            loanId: loanId,
            paymentNumber: parseInt(paymentNumber),
            borrower: {
                id: '3',
                name: 'Michael Johnson'
            },
            dueDate: '2025-06-05',
            amountDue: 458.33,
            principal: 416.67,
            interest: 41.67,
            status: 'pending'
        };
        
        openPaymentModal(mockPayment);
    });
}

// Load mock payments for development/demo
function loadMockPayments() {
    // Mock data for development
    let mockPayments = [
        {
            id: 'P001',
            loanId: 'L1001',
            borrower: 'John Doe',
            amount: 250.00,
            date: new Date().toISOString().split('T')[0], // Today's date
            method: 'Bank Transfer',
            status: 'Completed'
        },
        {
            id: 'P002',
            loanId: 'L1002',
            borrower: 'Alice Johnson',
            amount: 150.00,
            date: new Date().toISOString().split('T')[0], // Today's date
            method: 'Mobile Money',
            status: 'Completed'
        },
        {
            id: 'P003',
            loanId: 'L1003',
            borrower: 'Bob Smith',
            amount: 300.00,
            date: new Date(Date.now() - 86400000).toISOString().split('T')[0], // Yesterday
            method: 'Cash',
            status: 'Completed'
        },
        {
            id: 'P004',
            loanId: 'L1004',
            borrower: 'Eve Wilson',
            amount: 175.00,
            date: new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0], // 2 days ago
            method: 'Bank Transfer',
            status: 'Completed'
        },
        {
            id: 'P005',
            loanId: 'L1005',
            borrower: 'Sarah Williams',
            amount: 200.00,
            date: new Date().toISOString().split('T')[0],
            method: 'Bank Transfer',
            status: 'Pending'
        },
        {
            id: 'P006',
            loanId: 'L1006',
            borrower: 'Michael Johnson',
            amount: 350.00,
            date: new Date(Date.now() - 86400000).toISOString().split('T')[0],
            method: 'Mobile Money',
            status: 'Completed'
        }
    ];

    // Apply date filter if set
    if (currentDateFilter) {
        mockPayments = mockPayments.filter(payment => payment.date === currentDateFilter);
    }
    
    // Update the global payments variable
    payments = mockPayments;
    totalPages = 1;
    
    // Update pagination
    const paginationInfo = document.getElementById('pagination-info');
    const prevPageBtn = document.getElementById('prev-page');
    const nextPageBtn = document.getElementById('next-page');
    
    if (paginationInfo) {
        paginationInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    }
    
    if (prevPageBtn) {
        prevPageBtn.disabled = currentPage <= 1;
    }
    
    if (nextPageBtn) {
        nextPageBtn.disabled = currentPage >= totalPages;
    }
    
    // Render payments
    const paymentsTable = document.getElementById('recent-payments-table');
    if (paymentsTable) {
        const tableBody = paymentsTable.querySelector('tbody');
        if (tableBody) {
            renderPayments(tableBody);
        }
    }
}

// Helper function to get borrower name for sorting
function getBorrowerName(payment) {
    if (!payment) return '';
    if (typeof payment.borrower === 'string') return payment.borrower;
    if (payment.borrower?.name) return payment.borrower.name;
    if (payment.borrowerName) return payment.borrowerName;
    return '';
}

// Render payments in table
function renderPayments(tableBody) {
    if (!payments || payments.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="8" class="empty-message">No payments found</td></tr>';
        return;
    }
    
    // Sort payments by borrower name
    const sortedPayments = [...payments].sort((a, b) => {
        const nameA = getBorrowerName(a).toLowerCase();
        const nameB = getBorrowerName(b).toLowerCase();
        return nameA.localeCompare(nameB);
    });
    
    tableBody.innerHTML = '';
    
    // Use the sorted payments array
    sortedPayments.forEach(payment => {
        // Format IDs to show only last 6 digits
        const paymentId = payment.id ? payment.id.slice(-6) : '-';
        const loanId = payment.loanId ? payment.loanId.toString().slice(-6) : '-';
        // Get borrower name whether it's a string or object
        const borrowerName = typeof payment.borrower === 'string' 
            ? payment.borrower 
            : (payment.borrower?.name || 'Unknown');
            
        const tr = document.createElement('tr');
        
        // Format method for display
        let methodDisplay = '-';
        if (payment.method) {
            switch(payment.method.toLowerCase()) {
                case 'bank_transfer':
                case 'bank':
                    methodDisplay = 'Bank Transfer';
                    break;
                case 'mobile_money':
                case 'mobile':
                    methodDisplay = 'Mobile Money';
                    break;
                case 'cash':
                    methodDisplay = 'Cash';
                    break;
                case 'check':
                case 'cheque':
                    methodDisplay = 'Check';
                    break;
                default:
                    methodDisplay = payment.method.charAt(0).toUpperCase() + payment.method.slice(1);
            }
        }
        
        // Format date for display
        let paymentDate = '-';
        if (payment.date) {
            try {
                const date = new Date(payment.date);
                if (!isNaN(date.getTime())) {
                    paymentDate = date.toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                    });
                }
            } catch (e) {
                console.error('Error formatting date:', e);
            }
        }
        
        tr.innerHTML = `
            <td>${paymentId}</td>
            <td>${loanId}</td>
            <td>${borrowerName}</td>
            <td class="amount">${payment.amount ? `$${parseFloat(payment.amount).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : '-'}</td>
            <td class="date">${paymentDate}</td>
            <td>${methodDisplay}</td>
            <td><span class="status-badge ${payment.status ? payment.status.toLowerCase() : ''}">${payment.status || 'Pending'}</span></td>
            <td class="actions-cell"></td>
        `;
        
        // Add action buttons
        const actionsCell = tr.querySelector('td.actions-cell');
        actionsCell.innerHTML = ''; // Clear any existing content
        
        // Create view button
        const viewBtn = document.createElement('button');
        viewBtn.className = 'btn btn-sm btn-info mr-1';
        viewBtn.title = 'View Details';
        viewBtn.innerHTML = '<i class="fas fa-eye"></i>';
        viewBtn.onclick = (e) => {
            e.preventDefault();
            viewPaymentDetails(payment.id || `${payment.loanId}-${payment.paymentNumber}`);
        };
        actionsCell.appendChild(viewBtn);
        
        // Add record payment button if applicable
        if (payment.status === 'pending' && (auth.isAdmin() || auth.isLoanOfficer())) {
            const recordBtn = document.createElement('button');
            recordBtn.className = 'btn btn-sm btn-success mr-1';
            recordBtn.title = 'Record Payment';
            recordBtn.innerHTML = '<i class="fas fa-money-bill"></i>';
            recordBtn.onclick = (e) => {
                e.preventDefault();
                openPaymentModal(payment);
            };
            actionsCell.appendChild(recordBtn);
        }
        
        // Add print receipt button if applicable
        if (payment.status === 'paid' && (auth.isAdmin() || auth.isLoanOfficer())) {
            const printBtn = document.createElement('button');
            printBtn.className = 'btn btn-sm btn-primary';
            printBtn.title = 'Print Receipt';
            printBtn.innerHTML = '<i class="fas fa-print"></i>';
            printBtn.onclick = (e) => {
                e.preventDefault();
                printPaymentReceipt(payment.id || `${payment.loanId}-${payment.paymentNumber}`);
            };
            actionsCell.appendChild(printBtn);
        }
        tableBody.appendChild(tr);
    });
}

// Open payment modal
function openPaymentModal(payment = null) {
    const modal = document.getElementById('payment-modal');
    const modalTitle = document.getElementById('payment-modal-title');
    const paymentForm = document.getElementById('payment-form');
    const paymentIdInput = document.getElementById('payment-id');
    const loanIdInput = document.getElementById('loan-id');
    const paymentNumberInput = document.getElementById('payment-number');
    const borrowerNameInput = document.getElementById('borrower-name');
    const dueDateInput = document.getElementById('due-date');
    const amountDueInput = document.getElementById('amount-due');
    
    // Reset form
    paymentForm.reset();
    
    if (payment) {
        // Record existing payment
        modalTitle.textContent = 'Record Payment';
        paymentIdInput.value = payment.id || '';
        loanIdInput.value = payment.loanId;
        paymentNumberInput.value = payment.paymentNumber;
        borrowerNameInput.value = payment.borrower.name;
        dueDateInput.value = payment.dueDate;
        amountDueInput.value = payment.amountDue;
        
        // Set default payment date to today
        document.getElementById('payment-date').value = new Date().toISOString().split('T')[0];
        
        // Set default amount paid to amount due
        document.getElementById('amount-paid').value = payment.amountDue;
    } else {
        // New payment (manual entry)
        modalTitle.textContent = 'Record New Payment';
        paymentIdInput.value = '';
        loanIdInput.value = '';
        paymentNumberInput.value = '';
        borrowerNameInput.value = '';
        dueDateInput.value = '';
        amountDueInput.value = '';
        
        // Set default payment date to today
        document.getElementById('payment-date').value = new Date().toISOString().split('T')[0];
        
        // Enable loan selection fields
        loanIdInput.disabled = false;
        paymentNumberInput.disabled = false;
        
        // Populate loan dropdown
        populateLoanDropdown();
    }
    
    // Show modal
    modal.classList.add('active');
}

// Close payment modal
function closePaymentModal() {
    const modal = document.getElementById('payment-modal');
    modal.classList.remove('active');
    
    // If we were directed here from loan management, go back
    if (selectedLoanId && selectedPaymentNumber) {
        window.location.href = 'loan-management.html';
    }
}

// Populate loan dropdown
function populateLoanDropdown() {
    const loanIdInput = document.getElementById('loan-id');
    
    // Fetch active loans from API
    fetch(`${API_URL}/loans?status=active`, {
        method: 'GET',
        headers: auth.getAuthHeaders()
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to load loans');
        }
        return response.json();
    })
    .then(data => {
        const loans = data.loans || [];
        
        // Create datalist for loan IDs
        const datalist = document.createElement('datalist');
        datalist.id = 'loan-list';
        
        loans.forEach(loan => {
            const option = document.createElement('option');
            option.value = loan.id;
            option.textContent = `${loan.id} - ${loan.borrower.name}`;
            datalist.appendChild(option);
        });
        
        // Add datalist to document
        document.body.appendChild(datalist);
        
        // Connect input to datalist
        loanIdInput.setAttribute('list', 'loan-list');
        
        // Add event listener to load payment details when loan is selected
        loanIdInput.addEventListener('change', () => {
            const selectedLoanId = loanIdInput.value;
            if (selectedLoanId) {
                loadLoanPaymentDetails(selectedLoanId);
            }
        });
    })
    .catch(error => {
        console.error('Error loading loans:', error);
        app.showNotification(`Error: ${error.message}`, 'error');
        
        // For development/demo purposes, add mock loans
        const datalist = document.createElement('datalist');
        datalist.id = 'loan-list';
        
        const mockLoans = [
            { id: '1', borrower: { name: 'Michael Johnson' } },
            { id: '2', borrower: { name: 'Sarah Williams' } }
        ];
        
        mockLoans.forEach(loan => {
            const option = document.createElement('option');
            option.value = loan.id;
            option.textContent = `${loan.id} - ${loan.borrower.name}`;
            datalist.appendChild(option);
        });
        
        // Add datalist to document
        document.body.appendChild(datalist);
        
        // Connect input to datalist
        loanIdInput.setAttribute('list', 'loan-list');
        
        // Add event listener to load payment details when loan is selected
        loanIdInput.addEventListener('change', () => {
            const selectedLoanId = loanIdInput.value;
            if (selectedLoanId) {
                loadLoanPaymentDetails(selectedLoanId);
            }
        });
    });
}

// Load loan payment details
function loadLoanPaymentDetails(loanId) {
    const paymentNumberInput = document.getElementById('payment-number');
    
    // Fetch loan details from API
    fetch(`${API_URL}/loans/${loanId}`, {
        method: 'GET',
        headers: auth.getAuthHeaders()
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to load loan details');
        }
        return response.json();
    })
    .then(data => {
        const loan = data.loan;
        
        // Set borrower name
        document.getElementById('borrower-name').value = loan.borrower.name;
        
        // Fetch payment schedule
        return fetch(`${API_URL}/loans/${loanId}/payments?status=pending`, {
            method: 'GET',
            headers: auth.getAuthHeaders()
        });
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to load payment schedule');
        }
        return response.json();
    })
    .then(data => {
        const pendingPayments = data.payments || [];
        
        // Create datalist for payment numbers
        const datalist = document.createElement('datalist');
        datalist.id = 'payment-list';
        
        pendingPayments.forEach(payment => {
            const option = document.createElement('option');
            option.value = payment.paymentNumber;
            option.textContent = `${payment.paymentNumber} - Due: ${app.formatDate(payment.dueDate)}`;
            datalist.appendChild(option);
        });
        
        // Add datalist to document
        document.body.appendChild(datalist);
        
        // Connect input to datalist
        paymentNumberInput.setAttribute('list', 'payment-list');
        
        // Add event listener to load payment details when payment is selected
        paymentNumberInput.addEventListener('change', () => {
            const selectedPaymentNumber = paymentNumberInput.value;
            if (selectedPaymentNumber) {
                const payment = pendingPayments.find(p => p.paymentNumber.toString() === selectedPaymentNumber);
                if (payment) {
                    document.getElementById('due-date').value = payment.dueDate;
                    document.getElementById('amount-due').value = payment.amountDue;
                    document.getElementById('amount-paid').value = payment.amountDue;
                }
            }
        });
    })
    .catch(error => {
        console.error('Error loading loan payment details:', error);
        app.showNotification(`Error: ${error.message}`, 'error');
        
        // For development/demo purposes
        if (loanId === '1') {
            document.getElementById('borrower-name').value = 'Michael Johnson';
            
            // Create datalist for payment numbers
            const datalist = document.createElement('datalist');
            datalist.id = 'payment-list';
            
            const mockPayments = [
                { paymentNumber: 2, dueDate: '2025-07-05', amountDue: 458.33 },
                { paymentNumber: 3, dueDate: '2025-08-05', amountDue: 458.33 }
            ];
            
            mockPayments.forEach(payment => {
                const option = document.createElement('option');
                option.value = payment.paymentNumber;
                option.textContent = `${payment.paymentNumber} - Due: ${app.formatDate(payment.dueDate)}`;
                datalist.appendChild(option);
            });
            
            // Add datalist to document
            document.body.appendChild(datalist);
            
            // Connect input to datalist
            paymentNumberInput.setAttribute('list', 'payment-list');
            
            // Add event listener to load payment details when payment is selected
            paymentNumberInput.addEventListener('change', () => {
                const selectedPaymentNumber = paymentNumberInput.value;
                if (selectedPaymentNumber) {
                    const payment = mockPayments.find(p => p.paymentNumber.toString() === selectedPaymentNumber);
                    if (payment) {
                        document.getElementById('due-date').value = payment.dueDate;
                        document.getElementById('amount-due').value = payment.amountDue;
                        document.getElementById('amount-paid').value = payment.amountDue;
                    }
                }
            });
        } else if (loanId === '2') {
            document.getElementById('borrower-name').value = 'Sarah Williams';
            
            // Create datalist for payment numbers
            const datalist = document.createElement('datalist');
            datalist.id = 'payment-list';
            
            const mockPayments = [
                { paymentNumber: 1, dueDate: '2025-06-15', amountDue: 346.67 },
                { paymentNumber: 2, dueDate: '2025-07-15', amountDue: 346.67 }
            ];
            
            mockPayments.forEach(payment => {
                const option = document.createElement('option');
                option.value = payment.paymentNumber;
                option.textContent = `${payment.paymentNumber} - Due: ${app.formatDate(payment.dueDate)}`;
                datalist.appendChild(option);
            });
            
            // Add datalist to document
            document.body.appendChild(datalist);
            
            // Connect input to datalist
            paymentNumberInput.setAttribute('list', 'payment-list');
            
            // Add event listener to load payment details when payment is selected
            paymentNumberInput.addEventListener('change', () => {
                const selectedPaymentNumber = paymentNumberInput.value;
                if (selectedPaymentNumber) {
                    const payment = mockPayments.find(p => p.paymentNumber.toString() === selectedPaymentNumber);
                    if (payment) {
                        document.getElementById('due-date').value = payment.dueDate;
                        document.getElementById('amount-due').value = payment.amountDue;
                        document.getElementById('amount-paid').value = payment.amountDue;
                    }
                }
            });
        }
    });
}

// Save payment
function savePayment() {
    // Get form data
    const paymentData = {
        loanId: document.getElementById('loan-id').value,
        paymentNumber: parseInt(document.getElementById('payment-number').value),
        paymentDate: document.getElementById('payment-date').value,
        amountPaid: parseFloat(document.getElementById('amount-paid').value),
        method: document.getElementById('payment-method').value,
        notes: document.getElementById('payment-notes').value
    };
    
    // Validate form data
    if (!paymentData.loanId || !paymentData.paymentNumber || !paymentData.paymentDate || !paymentData.amountPaid || !paymentData.method) {
        app.showNotification('Please fill in all required fields', 'error');
        return;
    }
    
    // Send request to API
    fetch(`${API_URL}/payments`, {
        method: 'POST',
        headers: auth.getAuthHeaders(),
        body: JSON.stringify(paymentData)
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to save payment');
        }
        return response.json();
    })
    .then(data => {
        // Show success notification
        app.showNotification('Payment recorded successfully', 'success');
        
        // Close modal and reload payments
        closePaymentModal();
        loadPayments();
    })
    .catch(error => {
        console.error('Error saving payment:', error);
        app.showNotification(`Error: ${error.message}`, 'error');
        
        // For development/demo purposes
        const newPayment = {
            id: (Math.max(...payments.map(p => parseInt(p.id || '0'))) + 1).toString(),
            loanId: paymentData.loanId,
            paymentNumber: paymentData.paymentNumber,
            borrower: {
                id: '3',
                name: document.getElementById('borrower-name').value
            },
            paymentDate: paymentData.paymentDate,
            dueDate: document.getElementById('due-date').value,
            amountPaid: paymentData.amountPaid,
            amountDue: parseFloat(document.getElementById('amount-due').value),
            method: paymentData.method,
            status: 'paid'
        };
        
        payments.push(newPayment);
        
        // Close modal and reload payments
        closePaymentModal();
        const paymentsTable = document.getElementById('payments-table');
        const tableBody = paymentsTable.querySelector('tbody');
        renderPayments(tableBody);
        app.showNotification('Payment recorded successfully (Demo Mode)', 'success');
    });
}

// View payment details
function viewPaymentDetails(paymentId) {
    // Find payment
    const payment = payments.find(p => (p.id && p.id === paymentId) || (!p.id && `${p.loanId}-${p.paymentNumber}` === paymentId));
    if (!payment) {
        app.showNotification('Payment not found', 'error');
        return;
    }
    
    // Format method for display
    let methodDisplay = '-';
    if (payment.method) {
        switch(payment.method) {
            case 'bank_transfer':
                methodDisplay = 'Bank Transfer';
                break;
            case 'mobile_money':
                methodDisplay = 'Mobile Money';
                break;
            case 'cash':
                methodDisplay = 'Cash';
                break;
            case 'check':
                methodDisplay = 'Check';
                break;
        }
    }
    
    // Create and show modal with payment details
    const viewModal = document.createElement('div');
    viewModal.className = 'modal active';
    viewModal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>Payment Details</h2>
                <button class="close-btn" id="close-view-modal">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body">
                <div class="loan-details">
                    <div class="loan-details-row">
                        <div class="loan-details-label">Payment ID:</div>
                        <div class="loan-details-value">${payment.id ? payment.id.slice(-6) : `${payment.loanId.slice(-6)}-${payment.paymentNumber}`}</div>
                    </div>
                    <div class="loan-details-row">
                        <div class="loan-details-label">Loan ID:</div>
                        <div class="loan-details-value">${payment.loanId.slice(-6)}</div>
                    </div>
                    <div class="loan-details-row">
                        <div class="loan-details-label">Borrower:</div>
                        <div class="loan-details-value">${payment.borrower.name}</div>
                    </div>
                    <div class="loan-details-row">
                        <div class="loan-details-label">Payment Number:</div>
                        <div class="loan-details-value">${payment.paymentNumber}</div>
                    </div>
                    <div class="loan-details-row">
                        <div class="loan-details-label">Due Date:</div>
                        <div class="loan-details-value">${app.formatDate(payment.dueDate)}</div>
                    </div>
                    <div class="loan-details-row">
                        <div class="loan-details-label">Amount Due:</div>
                        <div class="loan-details-value">${app.formatCurrency(payment.amountDue)}</div>
                    </div>
                    ${payment.status === 'paid' ? `
                        <div class="loan-details-row">
                            <div class="loan-details-label">Payment Date:</div>
                            <div class="loan-details-value">${app.formatDate(payment.paymentDate)}</div>
                        </div>
                        <div class="loan-details-row">
                            <div class="loan-details-label">Amount Paid:</div>
                            <div class="loan-details-value">${app.formatCurrency(payment.amountPaid)}</div>
                        </div>
                        <div class="loan-details-row">
                            <div class="loan-details-label">Payment Method:</div>
                            <div class="loan-details-value">${methodDisplay}</div>
                        </div>
                    ` : ''}
                    <div class="loan-details-row">
                        <div class="loan-details-label">Status:</div>
                        <div class="loan-details-value">
                            <span class="status-badge status-${payment.status}">${payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}</span>
                        </div>
                    </div>
                </div>
                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" id="close-details">Close</button>
                    ${payment.status === 'pending' && (auth.isAdmin() || auth.isLoanOfficer()) ? 
                        `<button type="button" class="btn btn-primary" id="record-from-details">Record Payment</button>` : ''}
                    ${payment.status === 'paid' && (auth.isAdmin() || auth.isLoanOfficer()) ? 
                        `<button type="button" class="btn btn-primary" id="print-from-details">Print Receipt</button>` : ''}
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(viewModal);
    
    // Setup close button
    viewModal.querySelector('#close-view-modal').addEventListener('click', () => {
        viewModal.remove();
    });
    
    viewModal.querySelector('#close-details').addEventListener('click', () => {
        viewModal.remove();
    });
    
    // Setup record payment button if available
    const recordBtn = viewModal.querySelector('#record-from-details');
    if (recordBtn) {
        recordBtn.addEventListener('click', () => {
            viewModal.remove();
            openPaymentModal(payment);
        });
    }
    
    // Setup print receipt button if available
    const printBtn = viewModal.querySelector('#print-from-details');
    if (printBtn) {
        printBtn.addEventListener('click', () => {
            viewModal.remove();
            printPaymentReceipt(payment.id || `${payment.loanId}-${payment.paymentNumber}`);
        });
    }
    
    // Close when clicking outside
    viewModal.addEventListener('click', (e) => {
        if (e.target === viewModal) {
            viewModal.remove();
        }
    });
}

// Print payment receipt
function printPaymentReceipt(paymentId) {
    // Find payment
    const payment = payments.find(p => (p.id && p.id === paymentId) || (!p.id && `${p.loanId}-${p.paymentNumber}` === paymentId));
    if (!payment) {
        app.showNotification('Payment not found', 'error');
        return;
    }
    
    // Format method for display
    let methodDisplay = 'Unknown';
    switch(payment.method) {
        case 'bank_transfer':
            methodDisplay = 'Bank Transfer';
            break;
        case 'mobile_money':
            methodDisplay = 'Mobile Money';
            break;
        case 'cash':
            methodDisplay = 'Cash';
            break;
        case 'check':
            methodDisplay = 'Check';
            break;
    }
    
    // Create print window
    const printWindow = window.open('', '_blank');
    
    // Generate HTML content
    const content = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Payment Receipt - #${payment.id || `${payment.loanId}-${payment.paymentNumber}`}</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    margin: 20px;
                }
                .receipt {
                    max-width: 800px;
                    margin: 0 auto;
                    padding: 20px;
                    border: 1px solid #ddd;
                }
                .header {
                    text-align: center;
                    margin-bottom: 20px;
                }
                .header h1 {
                    color: #00395D;
                    margin-bottom: 5px;
                }
                .header p {
                    color: #666;
                    margin-top: 0;
                }
                .details {
                    margin-bottom: 20px;
                }
                .details-row {
                    display: flex;
                    margin-bottom: 5px;
                }
                .details-label {
                    font-weight: bold;
                    width: 200px;
                }
                .amount {
                    font-size: 24px;
                    text-align: center;
                    margin: 20px 0;
                    font-weight: bold;
                }
                .footer {
                    margin-top: 30px;
                    font-size: 12px;
                    text-align: center;
                    color: #666;
                }
                .signatures {
                    display: flex;
                    justify-content: space-between;
                    margin-top: 50px;
                }
                .signature {
                    width: 45%;
                }
                .signature-line {
                    border-top: 1px solid #000;
                    margin-top: 50px;
                    margin-bottom: 5px;
                }
            </style>
        </head>
        <body>
            <div class="receipt">
                <div class="header">
                    <h1>Washa Enterprises</h1>
                    <p>Payment Receipt</p>
                </div>
                
                <div class="details">
                    <div class="details-row">
                        <div class="details-label">Receipt Number:</div>
                        <div>${payment.id || `${payment.loanId}-${payment.paymentNumber}`}</div>
                    </div>
                    <div class="details-row">
                        <div class="details-label">Date:</div>
                        <div>${app.formatDate(payment.paymentDate)}</div>
                    </div>
                    <div class="details-row">
                        <div class="details-label">Loan ID:</div>
                        <div>${payment.loanId}</div>
                    </div>
                    <div class="details-row">
                        <div class="details-label">Borrower:</div>
                        <div>${payment.borrower.name}</div>
                    </div>
                    <div class="details-row">
                        <div class="details-label">Payment Number:</div>
                        <div>${payment.paymentNumber}</div>
                    </div>
                    <div class="details-row">
                        <div class="details-label">Payment Method:</div>
                        <div>${methodDisplay}</div>
                    </div>
                </div>
                
                <div class="amount">
                    ${app.formatCurrency(payment.amountPaid)}
                </div>
                
                <div class="signatures">
                    <div class="signature">
                        <div class="signature-line"></div>
                        <div>Authorized Signature</div>
                    </div>
                    <div class="signature">
                        <div class="signature-line"></div>
                        <div>Borrower Signature</div>
                    </div>
                </div>
                
                <div class="footer">
                    <p>This is an official receipt of Washa Enterprises Loan Management System</p>
                    <p>Printed on ${new Date().toLocaleDateString()}</p>
                </div>
            </div>
            
            <script>
                window.onload = function() {
                    window.print();
                };
            </script>
        </body>
        </html>
    `;
    
    // Write content to print window
    printWindow.document.open();
    printWindow.document.write(content);
    printWindow.document.close();
}

// Import payments from CSV
function importPaymentsFromCsv(file) {
    // Show CSV import modal
    const csvModal = document.getElementById('csv-import-modal');
    const csvPreview = document.getElementById('csv-preview');
    
    // Clear previous preview
    csvPreview.innerHTML = '';
    
    // Read file
    const reader = new FileReader();
    reader.onload = function(e) {
        const contents = e.target.result;
        const lines = contents.split('\n');
        
        // Preview CSV data
        const table = document.createElement('table');
        table.className = 'data-table';
        
        // Parse header
        const headerRow = document.createElement('tr');
        const headers = lines[0].split(',');
        
        headers.forEach(header => {
            const th = document.createElement('th');
            th.textContent = header.trim();
            headerRow.appendChild(th);
        });
        
        const thead = document.createElement('thead');
        thead.appendChild(headerRow);
        table.appendChild(thead);
        
        // Parse data rows
        const tbody = document.createElement('tbody');
        
        for (let i = 1; i < Math.min(lines.length, 6); i++) {
            if (lines[i].trim() === '') continue;
            
            const dataRow = document.createElement('tr');
            const cells = lines[i].split(',');
            
            cells.forEach(cell => {
                const td = document.createElement('td');
                td.textContent = cell.trim();
                dataRow.appendChild(td);
            });
            
            tbody.appendChild(dataRow);
        }
        
        table.appendChild(tbody);
        csvPreview.appendChild(table);
        
        // Show modal
        csvModal.classList.add('active');
        
        // Setup import button
        const importBtn = document.getElementById('confirm-import');
        importBtn.onclick = function() {
            processImportedPayments(lines);
            csvModal.classList.remove('active');
        };
        
        // Setup cancel button
        const cancelBtn = document.getElementById('cancel-import');
        cancelBtn.onclick = function() {
            csvModal.classList.remove('active');
        };
        
        // Setup close button
        const closeBtn = document.getElementById('close-csv-modal');
        closeBtn.onclick = function() {
            csvModal.classList.remove('active');
        };
    };
    
    reader.readAsText(file);
}

// Process imported payments from CSV
function processImportedPayments(lines) {
    // Parse header
    const headers = lines[0].split(',').map(h => h.trim());
    
    // Required columns
    const requiredColumns = ['loanId', 'paymentNumber', 'paymentDate', 'amountPaid', 'method'];
    
    // Check if required columns exist
    const missingColumns = requiredColumns.filter(col => !headers.includes(col));
    
    if (missingColumns.length > 0) {
        app.showNotification(`Missing required columns: ${missingColumns.join(', ')}`, 'error');
        return;
    }
    
    // Parse data rows
    const importedPayments = [];
    
    for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === '') continue;
        
        const cells = lines[i].split(',');
        const payment = {};
        
        headers.forEach((header, index) => {
            payment[header] = cells[index] ? cells[index].trim() : '';
        });
        
        // Validate required fields
        if (requiredColumns.every(col => payment[col])) {
            importedPayments.push(payment);
        }
    }
    
    if (importedPayments.length === 0) {
        app.showNotification('No valid payments found in CSV file', 'error');
        return;
    }
    
    // Send imported payments to API
    fetch(`${API_URL}/payments/import`, {
        method: 'POST',
        headers: auth.getAuthHeaders(),
        body: JSON.stringify({ payments: importedPayments })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to import payments');
        }
        return response.json();
    })
    .then(data => {
        // Show success notification
        app.showNotification(`Successfully imported ${data.imported} payments`, 'success');
        
        // Reload payments
        loadPayments();
    })
    .catch(error => {
        console.error('Error importing payments:', error);
        app.showNotification(`Error: ${error.message}`, 'error');
        
        // For development/demo purposes
        app.showNotification(`Successfully imported ${importedPayments.length} payments (Demo Mode)`, 'success');
        
        // Create mock payments from imported data
        importedPayments.forEach(importedPayment => {
            const newPayment = {
                id: (Math.max(...payments.map(p => parseInt(p.id || '0'))) + 1).toString(),
                loanId: importedPayment.loanId,
                paymentNumber: parseInt(importedPayment.paymentNumber),
                borrower: {
                    id: '3',
                    name: 'Imported Borrower'
                },
                paymentDate: importedPayment.paymentDate,
                dueDate: importedPayment.dueDate || new Date().toISOString().split('T')[0],
                amountPaid: parseFloat(importedPayment.amountPaid),
                amountDue: parseFloat(importedPayment.amountDue || importedPayment.amountPaid),
                method: importedPayment.method,
                status: 'paid'
            };
            
            payments.push(newPayment);
        });
        
        // Reload payments
        const paymentsTable = document.getElementById('payments-table');
        const tableBody = paymentsTable.querySelector('tbody');
        renderPayments(tableBody);
    });
}

// Helper function to create action buttons
function createActionButtons(actions) {
    const container = document.createElement('div');
    container.className = 'action-buttons-container';
    
    actions.forEach(action => {
        const button = document.createElement('button');
        button.className = `action-btn ${action.type}`;
        button.innerHTML = `<i class="fas fa-${action.icon}"></i>`;
        button.title = action.label;
        
        if (action.handler) {
            button.addEventListener('click', action.handler);
        }
        
        container.appendChild(button);
    });
    
    return container;
}

// Process JSON payments from uploaded JSON file
async function processJsonPayments() {
    try {
        // Create file input if it doesn't exist
        let fileInput = document.getElementById('json-file-upload');
        if (!fileInput) {
            fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.id = 'json-file-upload';
            fileInput.accept = '.json';
            fileInput.style.display = 'none';
            document.body.appendChild(fileInput);
        }
        
        // Reset the file input to allow selecting the same file again
        fileInput.value = '';
        
        // Return a promise that resolves when a file is selected
        return new Promise((resolve) => {
            fileInput.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) {
                    return resolve();
                }
                
                try {
                    // Show loading notification
                    app.showNotification('Processing payment data...', 'info');
                    
                    // Read the file
                    const fileContent = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = (e) => resolve(e.target.result);
                        reader.onerror = (e) => reject(new Error('Error reading file'));
                        reader.readAsText(file);
                    });
                    
                    // Parse JSON data
                    let paymentData;
                    try {
                        paymentData = JSON.parse(fileContent);
                    } catch (e) {
                        throw new Error('Invalid JSON file');
                    }
                    
                    if (!Array.isArray(paymentData) || paymentData.length === 0) {
                        throw new Error('No valid payment data found in the file');
                    }
                    
                    // Process the payment data
                    await processPaymentData(paymentData);
                    
                    // Show success message
                    app.showNotification('Payments processed successfully!', 'success');
                    
                    // Refresh the payments table
                    loadPayments();
                    
                    resolve();
                } catch (error) {
                    console.error('Error processing JSON payments:', error);
                    app.showNotification(`Error: ${error.message}`, 'error');
                    resolve();
                }
            };
            
            // Trigger file selection dialog
            fileInput.click();
        });
    } catch (error) {
        console.error('Error setting up file processing:', error);
        app.showNotification(`Error: ${error.message}`, 'error');
    }
}

// Helper function to process payment data
async function processPaymentData(paymentData) {
    try {
        // Show processing notification
        app.showNotification(`Processing ${paymentData.length} payment records...`, 'info');
        
        // Group payments by borrower for consolidation
        const consolidatedPayments = {};
        
        paymentData.forEach(payment => {
            // Use phone number or account number as the unique identifier
            const identifier = payment.phoneNumber || payment.accountNumber || payment.borrowerId;
            if (!identifier) return; // Skip if no valid identifier
            
            if (!consolidatedPayments[identifier]) {
                consolidatedPayments[identifier] = {
                    borrowerId: payment.borrowerId,
                    phoneNumber: payment.phoneNumber,
                    accountNumber: payment.accountNumber,
                    amount: 0,
                    payments: []
                };
            }
            
            // Convert amount to number and add to total
            const amount = parseFloat(payment.amount) || 0;
            consolidatedPayments[identifier].amount += amount;
            consolidatedPayments[identifier].payments.push({
                amount: amount,
                date: payment.date || new Date().toISOString(),
                reference: payment.reference || `PAY-${Date.now()}`,
                method: payment.method || 'bank_transfer'
            });
        });
        
        // Convert to array for processing
        const paymentsToProcess = Object.values(consolidatedPayments);
        
        // Send data to backend for processing
        // Use API_URL from config.js
        const processResponse = await fetch(`${API_URL}/payments/process-json`, {
            method: 'POST',
            headers: {
                ...auth.getAuthHeaders(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ payments: paymentsToProcess })
        });

        if (!processResponse.ok) {
            const errorData = await processResponse.json();
            throw new Error(errorData.message || 'Failed to process payments');
        }

        const results = await processResponse.json();
        
        // Show success notification with summary
        const successCount = results.processed || 0;
        const errorCount = results.errors ? results.errors.length : 0;
        
        if (errorCount > 0) {
            app.showNotification(
                `Processed ${successCount} payments with ${errorCount} errors. Check console for details.`,
                'warning'
            );
            console.error('Payment processing errors:', results.errors);
        } else {
            app.showNotification(
                `Successfully processed ${successCount} payments.`,
                'success'
            );
        }
        
        return results;
    } catch (error) {
        console.error('Error processing payment data:', error);
        throw error; // Re-throw to be handled by the caller
    }
}

// Export functions for use in other modules
window.paymentProcessing = {
    loadPayments,
    openPaymentModal,
    savePayment,
    viewPaymentDetails,
    printPaymentReceipt,
    importPaymentsFromCsv,
    processJsonPayments
};
