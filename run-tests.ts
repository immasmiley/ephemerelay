/**
 * Test Runner for 108-Sphere Integration System
 * 
 * Executes comprehensive tests on all modules
 */

import { runTests } from './test-suite.ts';

// Run all tests
console.log('🚀 Starting 108-Sphere Integration System Tests...\n');

runTests().then(() => {
    console.log('\n✅ Test execution completed');
}).catch((error) => {
    console.error('\n❌ Test execution failed:', error);
    process.exit(1);
}); 