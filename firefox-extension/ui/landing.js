// Landing page functionality
document.addEventListener('DOMContentLoaded', async function() {
    // Check authentication
    const session = await browser.storage.local.get(['credentials', 'username']);
    if (!session.credentials) {
        window.location.href = 'auth.html';
        return;
    }

    // Display username
    document.getElementById('userInfo').textContent = `Logged in as: ${session.username}`;
    
    // Add event listeners
    document.getElementById('logoutBtn').addEventListener('click', logout);
});

// Logout functionality
async function logout() {
    try {
        // Clear stored credentials (keep cognitoConfig)
        await browser.storage.local.remove(['credentials', 'username', 'accessToken', 'idToken']);
        
        // Redirect to login
        window.location.href = 'auth.html';
    } catch (error) {
        console.error('Logout failed:', error);
        // Force redirect anyway
        window.location.href = 'auth.html';
    }
}
