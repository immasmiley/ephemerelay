// Test script for storage contribution feature
async function testStorageContribution() {
    console.log('🧪 Testing storage contribution feature...\n');

    // 1. Test node registration
    console.log('1️⃣ Testing node registration...');
    const registrationResponse = await fetch('http://localhost:5000/api/nodes/register', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            storageAmount: 2 * 1024 * 1024 * 1024, // 2GB
            endpoint: 'ws://localhost:5001',
            pubkey: 'test-pubkey-' + Math.random().toString(36).substring(2)
        })
    });

    const regData = await registrationResponse.json();
    if (!regData.success) {
        throw new Error(`Registration failed: ${regData.error}`);
    }

    const nodeId = regData.nodeId;
    console.log(`✅ Node registered successfully with ID: ${nodeId}\n`);

    // 2. Test status updates
    console.log('2️⃣ Testing status updates...');
    for (let i = 0; i < 3; i++) {
        const statusResponse = await fetch('http://localhost:5000/api/nodes/status', {
            headers: {
                'X-Node-ID': nodeId
            }
        });

        const statusData = await statusResponse.json();
        console.log(`📊 Status update ${i + 1}:`);
        console.log(`   Storage used: ${formatBytes(statusData.usedStorage)}`);
        console.log(`   Events stored: ${statusData.eventsStored}`);
        console.log(`   Network load: ${statusData.networkLoad}%`);
        console.log(`   Uptime: ${formatUptime(statusData.uptime)}\n`);

        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
    }

    // 3. Test node unregistration
    console.log('3️⃣ Testing node unregistration...');
    const unregResponse = await fetch('http://localhost:5000/api/nodes/unregister', {
        method: 'POST',
        headers: {
            'X-Node-ID': nodeId
        }
    });

    const unregData = await unregResponse.json();
    if (!unregData.success) {
        throw new Error(`Unregistration failed: ${unregData.error}`);
    }

    console.log('✅ Node unregistered successfully\n');
    console.log('🎉 All tests completed successfully!');
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
}

// Run the tests
testStorageContribution().catch(error => {
    console.error('❌ Test failed:', error);
}); 