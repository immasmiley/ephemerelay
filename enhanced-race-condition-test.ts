/**
 * Enhanced Race Condition Test System
 * 
 * Tests Windows-native concurrency with 1000 operations for surgical precision verification.
 * Primary Rule Compliant: Uses PrivacyPreservingStorage for test result tracking.
 */

import { WindowsNativeConcurrencyManager } from './windows-native-concurrency.ts';
import { PrivacyPreservingStorage } from './privacy-storage.ts';
import { NostrEvent, RelayNode } from './types.ts';

interface TestResult {
    success: boolean;
    successRate: number;
    duration: number;
    details: string;
    operationResults: OperationResult[];
    concurrencyMetrics: ConcurrencyMetrics;
}

interface OperationResult {
    operationId: number;
    resourceId: string;
    success: boolean;
    duration: number;
    error?: string;
    rollbackPerformed?: boolean;
}

interface ConcurrencyMetrics {
    totalOperations: number;
    successfulOperations: number;
    averageLatency: number;
    maxLatency: number;
    minLatency: number;
    concurrentPeaks: number;
    lockContentionEvents: number;
}

export class EnhancedRaceConditionTester {
    private readonly storage: PrivacyPreservingStorage;
    private readonly concurrencyManager: WindowsNativeConcurrencyManager;
    
    constructor() {
        // Primary Rule compliance: Initialize storage
        const localNode: RelayNode = {
            nodeId: 'race_condition_tester',
            url: 'local://race-condition-test',
            currentConnections: 0,
            maxConnections: 1,
            storageUsed: 0,
            storageCapacity: 1000000,
            position: 0,
            virtualNodes: [0]
        };
        
        this.storage = new PrivacyPreservingStorage(localNode);
        this.concurrencyManager = new WindowsNativeConcurrencyManager();
        
        console.log('🔥 Enhanced Race Condition Tester initialized (Primary Rule compliant)');
    }
    
    async testWindowsNativeConcurrency(operationCount: number = 1000): Promise<TestResult> {
        console.log(`🔥 Testing Windows-native concurrency with ${operationCount} operations...`);
        
        const operations: Promise<OperationResult>[] = [];
        const startTime = Date.now();
        
        // Create operations with realistic data and contention
        for (let i = 0; i < operationCount; i++) {
            const operationPromise = this.createOperation(i, operationCount);
            operations.push(operationPromise);
        }
        
        // Execute all operations concurrently
        const results = await Promise.allSettled(operations);
        const duration = Date.now() - startTime;
        
        // Process results
        const operationResults: OperationResult[] = [];
        let successfulCount = 0;
        
        for (let i = 0; i < results.length; i++) {
            if (results[i].status === 'fulfilled') {
                const result = (results[i] as PromiseFulfilledResult<OperationResult>).value;
                operationResults.push(result);
                if (result.success) {
                    successfulCount++;
                }
            } else {
                const error = (results[i] as PromiseRejectedResult).reason;
                operationResults.push({
                    operationId: i,
                    resourceId: `test_resource_${i % 100}`,
                    success: false,
                    duration: 0,
                    error: error.message || 'Unknown error'
                });
            }
        }
        
        const successRate = (successfulCount / operationCount) * 100;
        
        // Calculate concurrency metrics
        const concurrencyMetrics = this.calculateConcurrencyMetrics(operationResults);
        
        // Log test results to Primary Rule storage
        await this.logTestResults(operationResults, successRate, duration, concurrencyMetrics);
        
        const testResult: TestResult = {
            success: successRate >= 98, // 98% minimum for perfect nuclear score
            successRate,
            duration,
            details: `Windows-native concurrency achieved ${successRate.toFixed(1)}% success rate (${successfulCount}/${operationCount}) in ${duration}ms`,
            operationResults,
            concurrencyMetrics
        };
        
        console.log(`✅ Success rate: ${successRate.toFixed(1)}% (${successfulCount}/${operationCount})`);
        console.log(`⚡ Duration: ${duration}ms`);
        console.log(`📊 Average latency: ${concurrencyMetrics.averageLatency.toFixed(2)}ms`);
        console.log(`🔒 Lock contention events: ${concurrencyMetrics.lockContentionEvents}`);
        
        return testResult;
    }
    
    private async createOperation(operationId: number, totalOperations: number): Promise<OperationResult> {
        const resourceId = `test_resource_${operationId % 100}`; // 100 unique resources for contention
        const operationStartTime = Date.now();
        
        try {
            const result = await this.concurrencyManager.executeAtomically(resourceId, async () => {
                // Realistic file operation with validation
                const data = {
                    id: resourceId,
                    operationId,
                    value: Math.random(),
                    timestamp: Date.now(),
                    processId: Deno.pid,
                    content: `Operation ${operationId} of ${totalOperations}`
                };
                
                const filePath = `D:\\sphere-storage\\data\\${resourceId}.json`;
                
                // Ensure directory exists
                await Deno.mkdir('D:\\sphere-storage\\data', { recursive: true });
                
                // Write data
                await Deno.writeTextFile(filePath, JSON.stringify(data, null, 2));
                
                // Verify write with small delay to simulate realistic I/O
                await new Promise(resolve => setTimeout(resolve, 1 + Math.random() * 3));
                
                const written = await Deno.readTextFile(filePath);
                const parsed = JSON.parse(written);
                
                // Validate data integrity
                if (parsed.id !== resourceId) {
                    throw new Error('Data corruption detected: ID mismatch');
                }
                
                if (parsed.operationId !== operationId) {
                    throw new Error('Data corruption detected: Operation ID mismatch');
                }
                
                // Additional integrity check
                if (!parsed.timestamp || parsed.timestamp <= 0) {
                    throw new Error('Data corruption detected: Invalid timestamp');
                }
                
                return parsed;
            });
            
            const duration = Date.now() - operationStartTime;
            
            return {
                operationId,
                resourceId,
                success: true,
                duration,
                rollbackPerformed: false
            };
            
        } catch (error) {
            const duration = Date.now() - operationStartTime;
            
            return {
                operationId,
                resourceId,
                success: false,
                duration,
                error: error.message,
                rollbackPerformed: error.message.includes('rollback')
            };
        }
    }
    
    private calculateConcurrencyMetrics(results: OperationResult[]): ConcurrencyMetrics {
        const successful = results.filter(r => r.success);
        const durations = successful.map(r => r.duration);
        
        const lockContentionEvents = results.filter(r => 
            r.error && (r.error.includes('lock') || r.error.includes('contention'))
        ).length;
        
        return {
            totalOperations: results.length,
            successfulOperations: successful.length,
            averageLatency: durations.length > 0 ? 
                durations.reduce((sum, d) => sum + d, 0) / durations.length : 0,
            maxLatency: durations.length > 0 ? Math.max(...durations) : 0,
            minLatency: durations.length > 0 ? Math.min(...durations) : 0,
            concurrentPeaks: Math.ceil(results.length / 10), // Estimate concurrent peaks
            lockContentionEvents
        };
    }
    
    private async logTestResults(
        results: OperationResult[], 
        successRate: number, 
        duration: number,
        metrics: ConcurrencyMetrics
    ): Promise<void> {
        try {
            const testEvent: NostrEvent = {
                id: `erct_test_${Date.now()}`,
                kind: 10817, // Enhanced race condition test
                pubkey: 'race_condition_tester',
                created_at: Math.floor(Date.now() / 1000),
                tags: [
                    ['test_type', 'windows_native_concurrency'],
                    ['success_rate', successRate.toString()],
                    ['total_duration', duration.toString()],
                    ['operation_count', results.length.toString()],
                    ['successful_operations', metrics.successfulOperations.toString()],
                    ['lock_contention_events', metrics.lockContentionEvents.toString()]
                ],
                content: JSON.stringify({
                    testResults: results,
                    successRate,
                    duration,
                    concurrencyMetrics: metrics,
                    timestamp: Date.now(),
                    testId: `erct_${Date.now()}`
                }),
                sig: 'race_condition_test_signature'
            };
            
            await this.storage.storeEvent(testEvent);
        } catch (logError) {
            console.warn(`Failed to log test results: ${logError.message}`);
        }
    }
    
    // Stress test with extreme concurrency
    async performStressTest(): Promise<TestResult> {
        console.log('🔥 Performing extreme stress test with 2000 operations...');
        return await this.testWindowsNativeConcurrency(2000);
    }
    
    // Targeted contention test
    async performContentionTest(): Promise<TestResult> {
        console.log('🔥 Performing targeted contention test with 500 operations on 10 resources...');
        
        const operations: Promise<OperationResult>[] = [];
        const startTime = Date.now();
        
        // Create high contention scenario: 500 operations on only 10 resources
        for (let i = 0; i < 500; i++) {
            const operationPromise = this.createContentionOperation(i);
            operations.push(operationPromise);
        }
        
        const results = await Promise.allSettled(operations);
        const duration = Date.now() - startTime;
        
        // Process results (similar to main test)
        const operationResults: OperationResult[] = [];
        let successfulCount = 0;
        
        for (let i = 0; i < results.length; i++) {
            if (results[i].status === 'fulfilled') {
                const result = (results[i] as PromiseFulfilledResult<OperationResult>).value;
                operationResults.push(result);
                if (result.success) {
                    successfulCount++;
                }
            } else {
                const error = (results[i] as PromiseRejectedResult).reason;
                operationResults.push({
                    operationId: i,
                    resourceId: `contention_resource_${i % 10}`,
                    success: false,
                    duration: 0,
                    error: error.message || 'Unknown error'
                });
            }
        }
        
        const successRate = (successfulCount / 500) * 100;
        const concurrencyMetrics = this.calculateConcurrencyMetrics(operationResults);
        
        return {
            success: successRate >= 95, // Lower threshold for extreme contention
            successRate,
            duration,
            details: `High contention test achieved ${successRate.toFixed(1)}% success rate`,
            operationResults,
            concurrencyMetrics
        };
    }
    
    private async createContentionOperation(operationId: number): Promise<OperationResult> {
        const resourceId = `contention_resource_${operationId % 10}`; // Only 10 resources
        const operationStartTime = Date.now();
        
        try {
            const result = await this.concurrencyManager.executeAtomically(resourceId, async () => {
                // Longer operation to increase contention
                const data = {
                    id: resourceId,
                    operationId,
                    contentionLevel: 'high',
                    value: Math.random(),
                    timestamp: Date.now()
                };
                
                const filePath = `D:\\sphere-storage\\data\\contention\\${resourceId}.json`;
                
                // Ensure directory exists
                await Deno.mkdir('D:\\sphere-storage\\data\\contention', { recursive: true });
                
                // Simulate longer I/O operation
                await new Promise(resolve => setTimeout(resolve, 5 + Math.random() * 10));
                
                await Deno.writeTextFile(filePath, JSON.stringify(data, null, 2));
                
                // Additional validation delay
                await new Promise(resolve => setTimeout(resolve, 2 + Math.random() * 5));
                
                const written = await Deno.readTextFile(filePath);
                const parsed = JSON.parse(written);
                
                if (parsed.id !== resourceId) {
                    throw new Error('High contention data corruption detected');
                }
                
                return parsed;
            });
            
            const duration = Date.now() - operationStartTime;
            
            return {
                operationId,
                resourceId,
                success: true,
                duration
            };
            
        } catch (error) {
            const duration = Date.now() - operationStartTime;
            
            return {
                operationId,
                resourceId,
                success: false,
                duration,
                error: error.message
            };
        }
    }
    
    // Cleanup method
    async cleanup(): Promise<void> {
        try {
            // Clean up test files
            await Deno.remove('D:\\sphere-storage\\data', { recursive: true });
            await Deno.remove('D:\\sphere-storage\\backup', { recursive: true });
            
            this.concurrencyManager.destroy();
            
            console.log('🧹 Enhanced Race Condition Tester cleanup completed');
        } catch (error) {
            console.warn(`Cleanup warning: ${error.message}`);
        }
    }
    
    // Statistics
    async getTestStats(): Promise<{
        totalTests: number;
        successfulTests: number;
        averageSuccessRate: number;
        bestSuccessRate: number;
        worstSuccessRate: number;
    }> {
        const events = await this.storage.queryEvents('race_condition_tester', [{
            kinds: [10817],
            limit: 50
        }]);
        
        let totalSuccessRate = 0;
        let successfulTests = 0;
        let bestRate = 0;
        let worstRate = 100;
        
        for (const event of events) {
            try {
                const content = JSON.parse(event.content);
                const rate = content.successRate || 0;
                
                totalSuccessRate += rate;
                bestRate = Math.max(bestRate, rate);
                worstRate = Math.min(worstRate, rate);
                
                if (rate >= 98) {
                    successfulTests++;
                }
            } catch {
                // Skip malformed events
            }
        }
        
        return {
            totalTests: events.length,
            successfulTests,
            averageSuccessRate: events.length > 0 ? totalSuccessRate / events.length : 0,
            bestSuccessRate: bestRate,
            worstSuccessRate: events.length > 0 ? worstRate : 0
        };
    }
}

// Factory function for Primary Rule compliance
export function createEnhancedRaceConditionTester(): EnhancedRaceConditionTester {
    return new EnhancedRaceConditionTester();
}

// Main test function for direct execution
export async function testWindowsNativeConcurrency(): Promise<TestResult> {
    const tester = createEnhancedRaceConditionTester();
    
    try {
        const result = await tester.testWindowsNativeConcurrency(1000);
        return result;
    } finally {
        await tester.cleanup();
    }
}