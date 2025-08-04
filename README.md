# EphemeraRelay - Distributed Private Nostr Relay

A distributed, privacy-preserving Nostr relay that enables members to contribute storage while maintaining strict privacy boundaries.

## Architecture Overview

EphemeraRelay uses a distributed architecture with the following key components:

### Core Features

- **Privacy-Preserving Storage**: Each server only stores events for recipients it's responsible for, with all content encrypted client-side
- **Distributed Storage**: Uses consistent hashing to distribute events across multiple member-operated servers
- **Fault Tolerance**: When nodes join or leave, only a small portion of data needs to be redistributed
- **Load Balancing**: Virtual nodes ensure even distribution of storage load across all participating servers
- **Member Control**: Only authorized relay members can operate servers, maintaining the private nature of the network

### Privacy Guarantees

- **Server operators cannot read messages**: All content encrypted client-side before storage
- **Routing privacy**: Servers only know hashed recipient identifiers, not actual pubkeys
- **Access isolation**: Each server only stores events for users it's responsible for
- **Zero-knowledge storage**: Servers can verify they should store events without seeing content

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd ephemerelay

# Install dependencies (Deno handles this automatically)
# No additional installation needed
```

## Configuration

### 1. Set Authorized Members

Edit `server.ts` to add authorized member pubkeys:

```typescript
const MEMBER_PUBKEYS = [
  '02f43f3c4bf805e0f6eec48f4e8f3c4bf805e0f6eec48f4e8f3c4bf805e0f6ee',
  '03f43f3c4bf805e0f6eec48f4e8f3c4bf805e0f6eec48f4e8f3c4bf805e0f6ee'
];
```

### 2. Configure Node Settings

Each node can be configured with:

- **Storage capacity**: How much storage the node contributes
- **Endpoint**: WebSocket endpoint for the node
- **Virtual nodes**: Number of virtual nodes for load balancing

## Running the Relay

### Development Mode

```bash
deno task dev
```

### Production Mode

```bash
deno run --allow-net server.ts
```

The relay will start on port 5000 by default.

## API Endpoints

### WebSocket (Nostr Protocol)

Connect to `ws://localhost:5000` for Nostr protocol support:

- `EVENT`: Store encrypted events
- `REQ`: Query events with filters
- `CLOSE`: Close subscriptions

### HTTP Endpoints

- `GET /health`: Health check and network statistics
- `GET /`: Basic information page

## Network Statistics

The `/health` endpoint provides detailed network statistics:

```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "stats": {
    "localEvents": 150,
    "ringInfo": {
      "totalNodes": 3,
      "virtualNodes": 450
    },
    "knownNodes": 3,
    "storageStats": {
      "totalEvents": 150,
      "uniqueRecipients": 25,
      "storageUsed": 1024000
    }
  }
}
```

## Distributed Architecture

### Consistent Hashing

The system uses consistent hashing to distribute events across nodes:

- Each recipient pubkey is hashed to determine responsible nodes
- Events are replicated to 3 nodes by default for fault tolerance
- Virtual nodes ensure even load distribution

### Node Discovery

Nodes automatically discover each other:

- Nodes announce themselves to the network
- Health checks ensure only active nodes are used
- Automatic cleanup of inactive nodes

### Privacy-Preserving Storage

Events are stored with privacy guarantees:

1. **Client-side encryption**: All content encrypted before storage
2. **Recipient-based routing**: Events only stored on nodes responsible for recipients
3. **Access control**: Only authorized recipients can decrypt content
4. **Zero-knowledge verification**: Nodes can verify storage responsibility without seeing content

## Security Features

### Authentication

- Only authorized member pubkeys can operate nodes
- Node announcements are verified against member list
- Unauthorized nodes are rejected

### Encryption

- All event content encrypted client-side using NIP-04
- Server operators cannot read message content
- Access keys derived from recipient pubkeys

### Privacy

- Recipient pubkeys hashed for routing
- Servers only know hashed identifiers
- No correlation between pubkeys and stored data

## Development

### Project Structure

```
ephemerelay/
├── server.ts                 # Main server entry point
├── types.ts                  # Type definitions
├── consistent-hash.ts        # Consistent hashing implementation
├── privacy-storage.ts        # Privacy-preserving storage
├── node-discovery.ts         # Node discovery and coordination
├── distributed-coordinator.ts # Distributed relay coordinator
├── distributed-handler.ts    # WebSocket message handler
├── deno.json                # Deno configuration
└── README.md                # This file
```

### Adding New Features

1. **New message types**: Add to `types.ts` and `distributed-handler.ts`
2. **Storage optimizations**: Modify `privacy-storage.ts`
3. **Network improvements**: Update `distributed-coordinator.ts`
4. **Discovery enhancements**: Extend `node-discovery.ts`

### Testing

```bash
# Run tests
deno test

# Run with coverage
deno test --coverage
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For questions or support, please open an issue on the repository.
