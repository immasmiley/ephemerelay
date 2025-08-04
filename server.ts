import { serve } from 'https://deno.land/std@0.181.0/http/server.ts';
import { EventEmitter } from 'https://deno.land/x/event@2.0.1/mod.ts';
import { matchFilters, verifySignature } from 'npm:nostr-tools@^1.7.4';
import { z } from 'https://deno.land/x/zod@v3.20.5/mod.ts';

type Event = z.infer<typeof eventSchema>;
type Filter = z.infer<typeof filterSchema>;
type Listener = (event: Event) => void;

const emitter = new EventEmitter<{ event: [Event] }>(0);
const BUFFER_TTL = 10000; // 10 sec

const buffer: {e: Event, t: number}[] = []

function gc() {
  const minTm = Date.now() - BUFFER_TTL;
  while(buffer.length > 0) {
    if (buffer[0].t >= minTm) break;
    buffer.shift();
  }
}

// Track contributing nodes
const contributingNodes = new Map();

// Node registration schema
const nodeRegistrationSchema = z.object({
  storageAmount: z.number().min(1 * 1024 * 1024 * 1024), // Minimum 1GB
  endpoint: z.string(),
  pubkey: z.string().min(1)
});

// MIME types for serving static files
const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon"
};

async function serveStaticFile(filePath: string): Promise<Response> {
  try {
    const ext = filePath.substring(filePath.lastIndexOf('.'));
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const file = await Deno.readFile(`./public${filePath}`);
    return new Response(file, { headers: { 'Content-Type': contentType } });
  } catch (error) {
    console.error(`Error serving static file ${filePath}:`, error);
    return new Response('File not found', { status: 404 });
  }
}

async function handleNodeRegistration(req: Request): Promise<Response> {
  try {
    const data = await req.json();
    const validatedData = nodeRegistrationSchema.parse(data);
    
    const nodeId = crypto.randomUUID();
    contributingNodes.set(nodeId, {
      ...validatedData,
      startTime: Date.now(),
      usedStorage: 0,
      eventsStored: 0,
      networkLoad: 0
    });

    return new Response(JSON.stringify({ 
      success: true, 
      nodeId 
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function handleNodeUnregistration(req: Request): Promise<Response> {
  const nodeId = req.headers.get('X-Node-ID');
  
  if (!nodeId || !contributingNodes.has(nodeId)) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Invalid node ID'
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  contributingNodes.delete(nodeId);
  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

function getNodeStatus(req: Request): Response {
  const nodeId = req.headers.get('X-Node-ID');
  
  if (!nodeId || !contributingNodes.has(nodeId)) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Invalid node ID'
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const node = contributingNodes.get(nodeId);
  const uptime = Date.now() - node.startTime;

  // Simulate some activity
  node.usedStorage = Math.min(
    node.storageAmount,
    node.usedStorage + Math.random() * 1024 * 1024
  );
  node.eventsStored += Math.floor(Math.random() * 10);
  node.networkLoad = Math.min(100, node.networkLoad + Math.random() * 5);

  return new Response(JSON.stringify({
    usedStorage: node.usedStorage,
    eventsStored: node.eventsStored,
    networkLoad: node.networkLoad,
    uptime
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

function connectStream(socket: WebSocket): void {
  const subs = new Map<string, Listener>();

  socket.onmessage = (e) => {
    console.log('msg', e.data);
    const json = jsonSchema.safeParse(e.data);
    const parsed = json.success ? relayMsgSchema.safeParse(json.data) : undefined;
    const msg = parsed?.success ? parsed.data : undefined;

    if (!msg) {
      socket.send(JSON.stringify(['NOTICE', 'invalid: failed to parse message']));
      return;
    }

    switch (msg[0]) {
      case 'EVENT':
        handleEvent(msg[1]);
        return;
      case 'REQ':
        handleReq(msg[1], msg.slice(2));
        return;
      case 'CLOSE':
        handleClose(msg[1]);
        return;
    }

    function handleEvent(event: Event) {
      emitter.emit('event', event);
      socket.send(JSON.stringify(['OK', event.id, true, '']));

      buffer.push({ e: event, t: Date.now() });
      gc();
    }

    function handleReq(sub: string, filters: Filter[]) {
      gc();
      for (const b of buffer) {
        if (matchFilters(filters, b.e))
          socket.send(JSON.stringify(['EVENT', sub, b.e]));
      }

      socket.send(JSON.stringify(['EOSE', sub]));

      const listener: Listener = (event) => {
        if (matchFilters(filters, event)) {
          socket.send(JSON.stringify(['EVENT', sub, event]));
        }
      };

      subs.set(sub, listener);
      emitter.on('event', listener);
    }

    function handleClose(sub: string) {
      const listener = subs.get(sub);
      if (listener) {
        emitter.off('event', listener);
      }
      subs.delete(sub);
    }
  };

  socket.onclose = () => {
    subs.forEach((listener) => {
      emitter.off('event', listener);
    });
    subs.clear();
  };
}

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  
  // Handle WebSocket upgrade for Nostr protocol
  if (req.headers.get("upgrade") === "websocket") {
    const { socket, response } = Deno.upgradeWebSocket(req);
    connectStream(socket);
    return response;
  }

  // Handle HTTP endpoints
  switch (url.pathname) {
    case '/api/nodes/register':
      if (req.method === 'POST') {
        return handleNodeRegistration(req);
      }
      break;

    case '/api/nodes/unregister':
      if (req.method === 'POST') {
        return handleNodeUnregistration(req);
      }
      break;

    case '/api/nodes/status':
      if (req.method === 'GET') {
        return getNodeStatus(req);
      }
      break;

    case '/':
      return new Response(await Deno.readFile('./public/index.html'), {
        headers: { 'Content-Type': 'text/html' }
      });

    case '/nostr':
      return new Response(await Deno.readFile('./public/nostr-interface.html'), {
        headers: { 
          'Content-Type': 'text/html',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });

    default:
      // Serve static files
      if (url.pathname.match(/\.(html|css|js|json|svg|png|jpg|ico)$/)) {
        return serveStaticFile(url.pathname);
      }
      break;
  }

  return new Response('Not found', { status: 404 });
}

const jsonSchema = z.string().transform((value, ctx) => {
  try {
    return JSON.parse(value);
  } catch (_e) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid JSON' });
    return z.NEVER;
  }
});

const filterSchema = z.object({
  ids: z.array(z.string()).optional(),
  kinds: z.array(z.number()).optional(),
  authors: z.array(z.string()).optional(),
  since: z.number().optional(),
  until: z.number().optional(),
  limit: z.number().optional(),
}).passthrough();

const eventSchema = z.object({
  id: z.string(),
  kind: z.number(),
  pubkey: z.string(),
  content: z.string(),
  tags: z.array(z.array(z.string())),
  created_at: z.number(),
  sig: z.string(),
}).refine((event) => verifySignature(event));

const relayMsgSchema = z.union([
  z.tuple([z.literal('EVENT'), eventSchema]),
  z.tuple([z.literal('REQ'), z.string()]).rest(filterSchema),
  z.tuple([z.literal('CLOSE'), z.string()]),
]);

console.log('🚀 Starting EphemeraRelay server on http://localhost:5001');

serve(handleRequest, { 
  port: 5001,
  onListen: ({ port, hostname }) => {
    console.log(`Server running at http://${hostname}:${port}/`);
  }
});
