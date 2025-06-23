// ID Generator Module
// Provides utilities for generating consistent, formatted IDs across the application

const IdGenerator = {
    // Generate a short alphanumeric ID
    _generateShortId: (length = 4) => {
        // Only use unambiguous characters: exclude I, 1, O, 0
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let id = '';
        for (let i = 0; i < length; i++) {
            id += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return id;
    },

    // Generate IDs with specific prefixes and consistent formats
    loan: () => `L-${IdGenerator._generateShortId(4)}`,     // e.g. L-XK4M
    payment: () => `P-${IdGenerator._generateShortId(4)}`,   // e.g. P-YH8V
    disbursement: () => `D-${IdGenerator._generateShortId(4)}`, // e.g. D-N7WR

    // Verify if an ID matches our format
    isValidId: (id) => {
        const pattern = /^[LPD]-[A-HJ-NP-Z2-9]{4}$/;
        return pattern.test(id);
    }
};

// Export for use in other modules
window.IdGenerator = IdGenerator;
