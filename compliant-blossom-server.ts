/**
 * COMPLIANT Blossom HTTP Server Integration
 * 
 * Adds Blossom HTTP endpoints to existing EphemeraRelay server
 * FULLY COMPLIANT with Primary Rule: Uses Git-backed PrivacyPreservingStorage
 * 
 * Integrates seamlessly with existing server.ts infrastructure
 * All Blossom operations use existing DistributedRelayCoordinator
 */

import { DistributedRelayCoordinator } from './distributed-coordinator.ts';
import { NodeDiscovery } from './node-discovery.ts';
import { RelayNode } from './types.ts';
import { createSphereStorageAdapter } from './sphere-storage-adapter.ts';
import { CompliantBlossomAdapter, createCompliantBlossomAdapter } from './compliant-blossom-adapter.ts';

interface BlossomServerConfig {
    coordinator: DistributedRelayCoordinator;
    nodeDiscovery: NodeDiscovery;
    localNode: RelayNode;
    baseUrl: string;
}

/**
 * COMPLIANT Blossom Server that extends existing EphemeraRelay
 * Uses Git-backed database for all blob storage operations
 */
export class CompliantBlossomServer {
    private blossomAdapter: CompliantBlossomAdapter;
    private config: BlossomServerConfig;

    constructor(config: BlossomServerConfig) {
        this.config = config;
        
        // COMPLIANT: Create Blossom adapter using existing Git-backed infrastructure
        const sphereStorage = createSphereStorageAdapter(config.coordinator, config.localNode);
        this.blossomAdapter = createCompliantBlossomAdapter(
            config.coordinator,
            sphereStorage,
            config.localNode,
            config.baseUrl
        );

        console.log('🌸 Blossom server endpoints initialized with Git-backed SphereOS database');
    }

    /**
     * Handle Blossom HTTP requests using existing infrastructure
     * Integrates with existing EphemeraRelay server request handling
     */
    async handleBlossomRequest(request: Request): Promise<Response | null> {
        const url = new URL(request.url);
        const method = request.method;
        const pathname = url.pathname;

        try {
            // BUD-01: GET /<sha256> - Retrieve blob
            if (method === 'GET' && this.isSha256Path(pathname)) {
                return await this.handleGetBlob(pathname);
            }

            // BUD-01: HEAD /<sha256> - Get blob metadata
            if (method === 'HEAD' && this.isSha256Path(pathname)) {
                return await this.handleHeadBlob(pathname);
            }

            // BUD-02: PUT /upload - Upload blob
            if (method === 'PUT' && pathname === '/upload') {
                return await this.handleUploadBlob(request);
            }

            // BUD-06: HEAD /upload - Check upload requirements
            if (method === 'HEAD' && pathname === '/upload') {
                return await this.handleUploadRequirements();
            }

            // BUD-02: GET /list/<pubkey> - List user blobs
            if (method === 'GET' && pathname.startsWith('/list/')) {
                return await this.handleListUserBlobs(request, pathname);
            }

            // BUD-02: DELETE /<sha256> - Delete blob
            if (method === 'DELETE' && this.isSha256Path(pathname)) {
                return await this.handleDeleteBlob(request, pathname);
            }

            // BUD-04: PUT /mirror - Mirror blob from another server
            if (method === 'PUT' && pathname === '/mirror') {
                return await this.handleMirrorBlob(request);
            }

            // BUD-03: GET /servers/<pubkey> - Get user server list
            if (method === 'GET' && pathname.startsWith('/servers/')) {
                return await this.handleGetUserServers(pathname);
            }

            // BUD-03: PUT /servers - Set user server list
            if (method === 'PUT' && pathname === '/servers') {
                return await this.handleSetUserServers(request);
            }

            // Not a Blossom endpoint
            return null;

        } catch (error) {
            console.error('Blossom request error:', error);
            return new Response(
                JSON.stringify({ message: `Internal server error: ${error.message}` }),
                { 
                    status: 500,
                    headers: { 'Content-Type': 'application/json' }
                }
            );
        }
    }

    /**
     * BUD-01: GET /<sha256> - Retrieve blob from Git-backed database
     */
    private async handleGetBlob(pathname: string): Promise<Response> {
        const sha256 = this.extractSha256FromPath(pathname);
        
        const blobData = await this.blossomAdapter.getBlob(sha256);
        
        if (!blobData) {
            return new Response('Blob not found', { status: 404 });
        }

        // Get metadata for content type
        const metadata = await this.blossomAdapter.getBlobMetadata(sha256);
        const contentType = metadata?.type || 'application/octet-stream';

        return new Response(blobData, {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Content-Length': blobData.length.toString(),
                'X-SHA256': sha256,
                'Cache-Control': 'public, max-age=31536000' // 1 year cache
            }
        });
    }

    /**
     * BUD-01: HEAD /<sha256> - Get blob metadata from Git-backed database
     */
    private async handleHeadBlob(pathname: string): Promise<Response> {
        const sha256 = this.extractSha256FromPath(pathname);
        
        const metadata = await this.blossomAdapter.getBlobMetadata(sha256);
        
        if (!metadata) {
            return new Response(null, { status: 404 });
        }

        return new Response(null, {
            status: 200,
            headers: {
                'Content-Type': metadata.type || 'application/octet-stream',
                'Content-Length': metadata.size.toString(),
                'X-SHA256': metadata.sha256,
                'X-Uploaded': metadata.uploaded.toString()
            }
        });
    }

    /**
     * BUD-02: PUT /upload - Upload blob to Git-backed database
     */
    private async handleUploadBlob(request: Request): Promise<Response> {
        try {
            // Get authentication header
            const authHeader = request.headers.get('Authorization');
            if (!authHeader) {
                return new Response(
                    JSON.stringify({ message: 'Authorization header required' }),
                    { status: 401, headers: { 'Content-Type': 'application/json' } }
                );
            }

            // Parse Nostr event from authorization header
            const authEvent = this.parseAuthHeader(authHeader);
            if (!authEvent) {
                return new Response(
                    JSON.stringify({ message: 'Invalid authorization event' }),
                    { status: 401, headers: { 'Content-Type': 'application/json' } }
                );
            }

            // Get blob data
            const blobData = new Uint8Array(await request.arrayBuffer());
            if (blobData.length === 0) {
                return new Response(
                    JSON.stringify({ message: 'No blob data provided' }),
                    { status: 400, headers: { 'Content-Type': 'application/json' } }
                );
            }

            // Get content type
            const contentType = request.headers.get('Content-Type');

            // Upload using Git-backed Blossom adapter
            const result = await this.blossomAdapter.uploadBlob(blobData, authEvent, contentType || undefined);

            if ('message' in result) {
                // Error response
                return new Response(
                    JSON.stringify(result),
                    { 
                        status: result.code || 500,
                        headers: { 'Content-Type': 'application/json' }
                    }
                );
            }

            // Success response
            return new Response(
                JSON.stringify(result),
                {
                    status: 201,
                    headers: { 
                        'Content-Type': 'application/json',
                        'Location': result.url
                    }
                }
            );

        } catch (error) {
            return new Response(
                JSON.stringify({ message: `Upload failed: ${error.message}` }),
                { status: 500, headers: { 'Content-Type': 'application/json' } }
            );
        }
    }

    /**
     * BUD-06: HEAD /upload - Check upload requirements
     */
    private async handleUploadRequirements(): Promise<Response> {
        return new Response(null, {
            status: 200,
            headers: {
                'X-Max-Size': '50000000', // 50MB limit
                'X-Allowed-Types': 'image/*, video/*, audio/*, text/*, application/*',
                'X-Auth-Required': 'true',
                'X-Auth-Type': 'nostr'
            }
        });
    }

    /**
     * BUD-02: GET /list/<pubkey> - List user blobs from Git-backed database
     */
    private async handleListUserBlobs(request: Request, pathname: string): Promise<Response> {
        const pubkey = pathname.split('/')[2];
        if (!pubkey) {
            return new Response(
                JSON.stringify({ message: 'Invalid pubkey' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
        }

        // Check for optional authentication
        const authHeader = request.headers.get('Authorization');
        let authEvent = null;
        if (authHeader) {
            authEvent = this.parseAuthHeader(authHeader);
        }

        const blobs = await this.blossomAdapter.listUserBlobs(pubkey, authEvent || undefined);

        return new Response(
            JSON.stringify(blobs),
            {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }

    /**
     * BUD-02: DELETE /<sha256> - Delete blob from Git-backed database
     */
    private async handleDeleteBlob(request: Request, pathname: string): Promise<Response> {
        const sha256 = this.extractSha256FromPath(pathname);

        // Get authentication
        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return new Response(
                JSON.stringify({ message: 'Authorization required for deletion' }),
                { status: 401, headers: { 'Content-Type': 'application/json' } }
            );
        }

        const authEvent = this.parseAuthHeader(authHeader);
        if (!authEvent) {
            return new Response(
                JSON.stringify({ message: 'Invalid authorization event' }),
                { status: 401, headers: { 'Content-Type': 'application/json' } }
            );
        }

        const result = await this.blossomAdapter.deleteBlob(sha256, authEvent);

        if (typeof result === 'boolean' && result) {
            return new Response(
                JSON.stringify({ message: 'Blob deleted successfully' }),
                { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
        } else if (typeof result === 'object' && 'message' in result) {
            return new Response(
                JSON.stringify(result),
                { 
                    status: result.code || 500,
                    headers: { 'Content-Type': 'application/json' }
                }
            );
        }

        return new Response(
            JSON.stringify({ message: 'Delete failed' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }

    /**
     * BUD-04: PUT /mirror - Mirror blob from another server
     */
    private async handleMirrorBlob(request: Request): Promise<Response> {
        try {
            const body = await request.json();
            const { sha256, url: sourceUrl } = body;

            if (!sha256 || !sourceUrl) {
                return new Response(
                    JSON.stringify({ message: 'sha256 and url required' }),
                    { status: 400, headers: { 'Content-Type': 'application/json' } }
                );
            }

            // Get authentication
            const authHeader = request.headers.get('Authorization');
            if (!authHeader) {
                return new Response(
                    JSON.stringify({ message: 'Authorization required for mirroring' }),
                    { status: 401, headers: { 'Content-Type': 'application/json' } }
                );
            }

            const authEvent = this.parseAuthHeader(authHeader);
            if (!authEvent) {
                return new Response(
                    JSON.stringify({ message: 'Invalid authorization event' }),
                    { status: 401, headers: { 'Content-Type': 'application/json' } }
                );
            }

            const result = await this.blossomAdapter.mirrorBlob(sha256, sourceUrl, authEvent);

            if ('message' in result) {
                return new Response(
                    JSON.stringify(result),
                    { 
                        status: result.code || 500,
                        headers: { 'Content-Type': 'application/json' }
                    }
                );
            }

            return new Response(
                JSON.stringify(result),
                {
                    status: 201,
                    headers: { 
                        'Content-Type': 'application/json',
                        'Location': result.url
                    }
                }
            );

        } catch (error) {
            return new Response(
                JSON.stringify({ message: `Mirror failed: ${error.message}` }),
                { status: 500, headers: { 'Content-Type': 'application/json' } }
            );
        }
    }

    /**
     * BUD-03: GET /servers/<pubkey> - Get user server list from Git-backed database
     */
    private async handleGetUserServers(pathname: string): Promise<Response> {
        const pubkey = pathname.split('/')[2];
        if (!pubkey) {
            return new Response(
                JSON.stringify({ message: 'Invalid pubkey' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
        }

        const servers = await this.blossomAdapter.getUserServerList(pubkey);

        return new Response(
            JSON.stringify({ servers }),
            {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }

    /**
     * BUD-03: PUT /servers - Set user server list in Git-backed database
     */
    private async handleSetUserServers(request: Request): Promise<Response> {
        try {
            const body = await request.json();
            const { pubkey, servers } = body;

            if (!pubkey || !Array.isArray(servers)) {
                return new Response(
                    JSON.stringify({ message: 'pubkey and servers array required' }),
                    { status: 400, headers: { 'Content-Type': 'application/json' } }
                );
            }

            // Get authentication
            const authHeader = request.headers.get('Authorization');
            if (!authHeader) {
                return new Response(
                    JSON.stringify({ message: 'Authorization required' }),
                    { status: 401, headers: { 'Content-Type': 'application/json' } }
                );
            }

            const authEvent = this.parseAuthHeader(authHeader);
            if (!authEvent) {
                return new Response(
                    JSON.stringify({ message: 'Invalid authorization event' }),
                    { status: 401, headers: { 'Content-Type': 'application/json' } }
                );
            }

            const success = await this.blossomAdapter.setUserServerList(pubkey, servers, authEvent);

            if (success) {
                return new Response(
                    JSON.stringify({ message: 'Server list updated successfully' }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } }
                );
            } else {
                return new Response(
                    JSON.stringify({ message: 'Failed to update server list' }),
                    { status: 400, headers: { 'Content-Type': 'application/json' } }
                );
            }

        } catch (error) {
            return new Response(
                JSON.stringify({ message: `Update failed: ${error.message}` }),
                { status: 500, headers: { 'Content-Type': 'application/json' } }
            );
        }
    }

    // Helper methods

    private isSha256Path(pathname: string): boolean {
        const sha256Pattern = /^\/[a-f0-9]{64}(?:\.[a-zA-Z0-9]+)?$/;
        return sha256Pattern.test(pathname);
    }

    private extractSha256FromPath(pathname: string): string {
        // Remove leading slash and optional file extension
        const parts = pathname.slice(1).split('.');
        return parts[0];
    }

    private parseAuthHeader(authHeader: string): any {
        try {
            // Parse Nostr event from Authorization header
            // Format: "Nostr <base64-encoded-event>"
            if (!authHeader.startsWith('Nostr ')) {
                return null;
            }

            const eventData = authHeader.slice(6); // Remove "Nostr "
            const eventJson = atob(eventData); // Decode base64
            const event = JSON.parse(eventJson);

            // Validate required fields
            if (!event.id || !event.pubkey || !event.sig || event.kind !== 24242) {
                return null;
            }

            return event;

        } catch (error) {
            console.error('Error parsing auth header:', error);
            return null;
        }
    }
}

/**
 * Integration function for existing EphemeraRelay server
 * Add this to your existing server.ts handleRequest function
 */
export function integrateBlossomWithExistingServer(
    coordinator: DistributedRelayCoordinator,
    nodeDiscovery: NodeDiscovery,
    localNode: RelayNode,
    baseUrl: string = 'http://localhost:5001'
): CompliantBlossomServer {
    return new CompliantBlossomServer({
        coordinator,
        nodeDiscovery,
        localNode,
        baseUrl
    });
}

/**
 * Example integration with existing server.ts:
 * 
 * ```typescript
 * // In your existing server.ts, add this to handleRequest:
 * 
 * async function handleRequest(req: Request): Promise<Response> {
 *   // Try Blossom endpoints first
 *   const blossomResponse = await blossomServer.handleBlossomRequest(req);
 *   if (blossomResponse) {
 *     return blossomResponse;
 *   }
 *   
 *   // Continue with existing EphemeraRelay handling
 *   // ... your existing code
 * }
 * ```
 */