# EphemeraRelay - Distributed Nostr Relay

A privacy-preserving, distributed Nostr relay implementation with storage contribution capabilities.

## 🌟 Features

- **Distributed Architecture**: Multiple nodes can contribute storage and processing power
- **Privacy-Preserving**: Client-side encryption with NIP-04 support
- **Consistent Hashing**: Intelligent data distribution across nodes
- **Health Monitoring**: Active monitoring of node health and performance
- **Web Interface**: Modern PWA with authentication and storage contribution
- **Nostr Protocol**: Full compliance with Nostr protocol specifications

## 🚀 Quick Start

### Prerequisites
- [Deno](https://deno.land/) runtime
- Windows, macOS, or Linux

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/nnamdii/ephemerelay.git
   cd ephemerelay
   ```

2. **Run the setup script:**
   ```bash
   # Windows
   .\setup.ps1
   
   # macOS/Linux
   ./setup.sh
   ```

3. **Start the server:**
   ```bash
   # Windows
   .\start.bat
   
   # macOS/Linux
   deno task start
   ```

4. **Access the interface:**
   - Main interface: http://localhost:5001/
   - Nostr interface: http://localhost:5001/nostr
   - Health check: http://localhost:5001/health

## 🔧 Architecture

### Core Components

- **`server.ts`**: Main server with Nostr protocol handling
- **`types.ts`**: TypeScript interfaces and NostrClient implementation
- **`health-monitor.ts`**: Active health monitoring system
- **`privacy-storage.ts`**: Privacy-preserving event storage
- **`consistent-hash.ts`**: Distributed data placement
- **`node-discovery.ts`**: Node discovery and coordination

### Web Interface

- **`public/nostr-interface.html`**: Main Nostr client interface
- **`public/js/nostr-interface.js`**: Client-side logic
- **`public/css/nostr-interface.css`**: Modern responsive styling

## 🔐 Authentication

The system supports both hex and nsec (bech32) private key formats:

- **Hex format**: 64-character hexadecimal string
- **Nsec format**: `nsec1[58 characters]` (Nostr bech32 format)

Example nsec key: `nsec1rugv94sqvdye9ks4q4cawyfav33csuumnza8t4xjxsj7uj5g3ytsgq6cvx`

## 💾 Storage Contribution

Any user with 1GB+ available storage can contribute to the distributed network:

1. **Authenticate** with your Nostr private key
2. **Set storage amount** (1-10 GB)
3. **Click "Start Contributing"** to join the network
4. **Monitor your node** through the web interface

## 🔍 API Endpoints

- `GET /health` - Server health status
- `POST /api/nodes/register` - Register a contributing node
- `POST /api/nodes/unregister` - Unregister a node
- `GET /api/nodes/status` - Get node status

## 🛠️ Development

### Project Structure
```
ephemerelay/
├── server.ts              # Main server
├── types.ts               # TypeScript interfaces
├── health-monitor.ts      # Health monitoring
├── privacy-storage.ts     # Privacy-preserving storage
├── consistent-hash.ts     # Distributed hashing
├── node-discovery.ts      # Node discovery
├── public/                # Web interface files
│   ├── nostr-interface.html
│   ├── js/
│   └── css/
├── setup.ps1             # Windows setup
├── setup.sh              # Unix setup
└── start.bat             # Windows start script
```

### Key Features Implemented

✅ **Distributed Architecture**: Multiple nodes can contribute storage  
✅ **Privacy Preservation**: Client-side encryption with NIP-04  
✅ **Consistent Hashing**: Intelligent data distribution  
✅ **Health Monitoring**: Active node health tracking  
✅ **Web Interface**: Modern PWA with authentication  
✅ **Nostr Protocol**: Full protocol compliance  
✅ **Storage Contribution**: User-friendly contribution system  
✅ **Fault Tolerance**: Automatic recovery and redistribution  

## 🔒 Privacy Guarantees

- **Server operators cannot read messages**: All content encrypted client-side
- **Routing privacy**: Servers only know hashed recipient identifiers
- **Access isolation**: Each server only stores events for responsible users
- **Zero-knowledge storage**: Servers verify storage without seeing content

## 🚀 Performance

- **Lazy loading**: Only active data consumes memory
- **Geometric compression**: Leverages lattice relationships
- **Smart caching**: Intelligent prefetching based on usage patterns
- **Elastic scaling**: Memory usage adapts to actual data patterns

## 📊 Network Statistics

The interface provides real-time statistics:
- Total events processed
- Active subscriptions
- Network load percentage
- Storage usage metrics
- Node health status

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is open source and available under the MIT License.

## 🔗 Links

- **GitHub**: https://github.com/nnamdii/ephemerelay
- **Nostr Protocol**: https://github.com/nostr-protocol/nostr
- **Deno Runtime**: https://deno.land/

---

**EphemeraRelay** - Revolutionizing Nostr relay architecture with distributed, privacy-preserving technology.
