/**
 * LARGE DATA GENERATOR
 * 
 * Overcomes Web Crypto API 65KB limit by implementing chunked random data generation.
 * Enables generation of arbitrarily large random datasets for testing and real usage.
 */

export interface LargeDataOptions {
    sizeInBytes: number;
    chunkSize?: number;
    seedString?: string;
    useSecureRandom?: boolean;
}

export interface GenerationProgress {
    bytesGenerated: number;
    totalBytes: number;
    percentComplete: number;
    chunksCompleted: number;
    totalChunks: number;
}

export class LargeDataGenerator {
    private static readonly DEFAULT_CHUNK_SIZE = 32768; // 32KB (safe limit)
    private static readonly MAX_SAFE_CHUNK_SIZE = 65536; // 64KB (Web Crypto limit)

    /**
     * Generate large random data by chunking to overcome crypto API limits
     */
    static async generateLargeRandomData(sizeInBytes: number): Promise<Uint8Array> {
        if (sizeInBytes <= 0) {
            throw new Error('Size must be positive');
        }

        const result = new Uint8Array(sizeInBytes);
        const chunkSize = this.DEFAULT_CHUNK_SIZE;
        let offset = 0;

        console.log(`🔢 Generating ${sizeInBytes} bytes of random data in ${Math.ceil(sizeInBytes / chunkSize)} chunks...`);

        while (offset < sizeInBytes) {
            const remainingBytes = Math.min(chunkSize, sizeInBytes - offset);
            
            try {
                const chunk = crypto.getRandomValues(new Uint8Array(remainingBytes));
                result.set(chunk, offset);
                offset += remainingBytes;

                // Progress reporting for large generations
                if (sizeInBytes > 1024 * 1024 && offset % (1024 * 1024) === 0) {
                    console.log(`   Generated ${Math.floor(offset / 1024 / 1024)}MB / ${Math.floor(sizeInBytes / 1024 / 1024)}MB`);
                }
            } catch (error) {
                throw new Error(`Failed to generate random data chunk at offset ${offset}: ${error.message}`);
            }
        }

        console.log(`✅ Successfully generated ${sizeInBytes} bytes of random data`);
        return result;
    }

    /**
     * Generate large random data with progress callback
     */
    static async generateLargeRandomDataWithProgress(
        sizeInBytes: number,
        progressCallback?: (progress: GenerationProgress) => void
    ): Promise<Uint8Array> {
        if (sizeInBytes <= 0) {
            throw new Error('Size must be positive');
        }

        const result = new Uint8Array(sizeInBytes);
        const chunkSize = this.DEFAULT_CHUNK_SIZE;
        const totalChunks = Math.ceil(sizeInBytes / chunkSize);
        let offset = 0;
        let chunksCompleted = 0;

        while (offset < sizeInBytes) {
            const remainingBytes = Math.min(chunkSize, sizeInBytes - offset);
            
            try {
                const chunk = crypto.getRandomValues(new Uint8Array(remainingBytes));
                result.set(chunk, offset);
                offset += remainingBytes;
                chunksCompleted++;

                // Report progress
                if (progressCallback) {
                    progressCallback({
                        bytesGenerated: offset,
                        totalBytes: sizeInBytes,
                        percentComplete: (offset / sizeInBytes) * 100,
                        chunksCompleted,
                        totalChunks
                    });
                }
            } catch (error) {
                throw new Error(`Failed to generate random data chunk ${chunksCompleted + 1}/${totalChunks}: ${error.message}`);
            }
        }

        return result;
    }

    /**
     * Generate deterministic pseudo-random data for testing
     */
    static generatePseudoRandomData(sizeInBytes: number, seed: string = 'default_seed'): Uint8Array {
        const result = new Uint8Array(sizeInBytes);
        
        // Simple Linear Congruential Generator for deterministic testing
        let seedValue = this.hashString(seed);
        
        for (let i = 0; i < sizeInBytes; i++) {
            seedValue = (seedValue * 1664525 + 1013904223) % 4294967296;
            result[i] = seedValue & 0xFF;
        }
        
        return result;
    }

    /**
     * Generate mixed random data (crypto + pseudo-random for very large sizes)
     */
    static async generateMixedRandomData(sizeInBytes: number): Promise<Uint8Array> {
        const result = new Uint8Array(sizeInBytes);
        const secureSize = Math.min(sizeInBytes, 1024 * 1024); // First 1MB is cryptographically secure
        
        // Generate secure random for initial portion
        if (secureSize > 0) {
            const secureData = await this.generateLargeRandomData(secureSize);
            result.set(secureData, 0);
        }
        
        // Fill remainder with pseudo-random (for very large files)
        if (sizeInBytes > secureSize) {
            const pseudoData = this.generatePseudoRandomData(sizeInBytes - secureSize, secureSize.toString());
            result.set(pseudoData, secureSize);
        }
        
        return result;
    }

    /**
     * Test the random data generator with various sizes
     */
    static async testRandomGeneration(): Promise<boolean> {
        console.log('🧪 Testing Large Data Generator...');
        
        const testSizes = [
            1024,           // 1KB
            65536,          // 64KB (at limit)
            131072,         // 128KB (over limit)
            1048576,        // 1MB
            10485760        // 10MB
        ];
        
        for (const size of testSizes) {
            try {
                console.log(`Testing ${size} bytes...`);
                const startTime = Date.now();
                const data = await this.generateLargeRandomData(size);
                const endTime = Date.now();
                
                // Verify data quality
                const uniqueBytes = new Set(data).size;
                const entropy = uniqueBytes / 256;
                
                console.log(`✅ ${size} bytes: ${endTime - startTime}ms, entropy: ${(entropy * 100).toFixed(1)}%`);
                
                if (data.length !== size) {
                    throw new Error(`Expected ${size} bytes, got ${data.length}`);
                }
                
                if (entropy < 0.8) {
                    console.warn(`⚠️ Low entropy (${(entropy * 100).toFixed(1)}%) for ${size} bytes`);
                }
                
            } catch (error) {
                console.error(`❌ Failed to generate ${size} bytes: ${error.message}`);
                return false;
            }
        }
        
        console.log('✅ All random data generation tests passed!');
        return true;
    }

    /**
     * Helper function to hash a string to a number
     */
    private static hashString(str: string): number {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash);
    }

    /**
     * Memory-efficient streaming random data generation
     */
    static async* generateStreamingRandomData(totalBytes: number, chunkSize: number = this.DEFAULT_CHUNK_SIZE): AsyncGenerator<Uint8Array> {
        let bytesGenerated = 0;
        
        while (bytesGenerated < totalBytes) {
            const remainingBytes = Math.min(chunkSize, totalBytes - bytesGenerated);
            const chunk = await this.generateLargeRandomData(remainingBytes);
            bytesGenerated += remainingBytes;
            yield chunk;
        }
    }

    /**
     * Validate generated data quality
     */
    static validateRandomData(data: Uint8Array): { entropy: number; distribution: number[]; isValid: boolean } {
        const distribution = new Array(256).fill(0);
        
        for (const byte of data) {
            distribution[byte]++;
        }
        
        // Calculate entropy
        const length = data.length;
        let entropy = 0;
        for (const count of distribution) {
            if (count > 0) {
                const probability = count / length;
                entropy -= probability * Math.log2(probability);
            }
        }
        
        const maxEntropy = 8; // Maximum entropy for 8-bit data
        const normalizedEntropy = entropy / maxEntropy;
        
        return {
            entropy: normalizedEntropy,
            distribution,
            isValid: normalizedEntropy > 0.95 // Good random data should have high entropy
        };
    }
}

// Test the generator if run directly
if (import.meta.main) {
    try {
        await LargeDataGenerator.testRandomGeneration();
    } catch (error) {
        console.error('Large Data Generator test failed:', error);
        Deno.exit(1);
    }
}