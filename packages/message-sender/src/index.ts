/**
 * Unified postMessage-based RPC transport.
 *
 * Covers three browser contexts that all share the same
 * ``postMessage`` / ``onmessage`` pattern:
 *
 * 1. **Web Worker** — ``self.postMessage`` / ``self.onmessage``
 * 2. **iframe**     — ``targetWindow.postMessage`` / ``window.addEventListener('message', …)``
 * 3. **Chrome extension (long-lived)** — ``port.postMessage`` / ``port.onMessage``
 *
 * Bootstrap strategy
 * ------------------
 * Because postMessage channels are already available between the two sides,
 * we use them to exchange a WebSocket relay port.  Once the WS connection is
 * established the actual RPC traffic flows over binary (CBOR) WebSocket frames
 * for efficiency, while the postMessage channel stays open for control signals.
 */
import { MessageReceiver, Client, ISender, Message } from 'xuri-rpc';

// ---------------------------------------------------------------------------
// Abstraction over the three postMessage flavours
// ---------------------------------------------------------------------------

export interface PostMessageEndpoint {
    /** Send a JSON-serialisable message to the peer. */
    postMessage(msg: any): void;
    /** Register a handler for incoming messages from the peer. */
    onMessage(handler: (msg: any) => void): void;
}

/** Create an endpoint for a Web Worker context (call inside the worker). */
export function workerEndpoint(worker?: Worker | any): PostMessageEndpoint {
    const target: any = worker ?? self;
    return {
        postMessage: (msg) => target.postMessage(msg),
        onMessage: (handler) => { target.onmessage = (ev: MessageEvent) => handler(ev.data); },
    };
}

/** Create an endpoint for an iframe (call in the parent page). */
export function iframeEndpoint(iframe: HTMLIFrameElement, targetOrigin = '*'): PostMessageEndpoint {
    return {
        postMessage: (msg) => iframe.contentWindow!.postMessage(msg, targetOrigin),
        onMessage: (handler) => {
            window.addEventListener('message', (ev: MessageEvent) => {
                if (ev.source === iframe.contentWindow) handler(ev.data);
            });
        },
    };
}

/** Create an endpoint inside an iframe (call inside the iframe). */
export function iframeChildEndpoint(parentOrigin = '*'): PostMessageEndpoint {
    return {
        postMessage: (msg) => window.parent.postMessage(msg, parentOrigin),
        onMessage: (handler) => {
            window.addEventListener('message', (ev: MessageEvent) => {
                if (ev.source === window.parent) handler(ev.data);
            });
        },
    };
}

/** Create an endpoint for a Chrome extension long-lived port. */
export function chromeExtensionPortEndpoint(port: { postMessage(msg: any): void; onMessage: { addListener(cb: (msg: any) => void): void } }): PostMessageEndpoint {
    return {
        postMessage: (msg) => port.postMessage(msg),
        onMessage: (handler) => { port.onMessage.addListener(handler); },
    };
}

// ---------------------------------------------------------------------------
// WebSocket relay sender (shared by both sides after bootstrap)
// ---------------------------------------------------------------------------

class WebSocketRelaySender implements ISender {
    private ws: WebSocket;
    constructor(ws: WebSocket) { this.ws = ws; }
    async send(message: Message) {
        // Use cbor-x for binary encoding
        const { encode } = await import('cbor-x');
        this.ws.send(encode(message));
    }
}

// ---------------------------------------------------------------------------
// Server side — starts a WS relay, tells client the port via postMessage
// ---------------------------------------------------------------------------

export async function createServer(
    hostId: string,
    endpoint: PostMessageEndpoint,
): Promise<(mainObject: any) => [MessageReceiver, (mainObject: any) => [MessageReceiver, any]]> {
    const { WebSocketServer } = await import('ws');
    const wss = new WebSocketServer({ port: 0 });

    const relayPort = (wss.address() as any).port;

    const messageReceiver = new MessageReceiver(hostId);
    const client = new Client(hostId);

    // Wait for the WS client to connect
    const wsConnected = new Promise<any>((resolve) => {
        wss.on('connection', (ws: any) => resolve(ws));
    });

    // Tell the peer our port via postMessage
    endpoint.postMessage({ type: '__rpc_relay_port', port: relayPort });

    const ws = await wsConnected;
    const sender = new WebSocketRelaySender(ws);
    client.setSender(() => sender);

    // Handle incoming WS messages
    ws.on('message', async (data: ArrayBuffer) => {
        const { decode } = await import('cbor-x');
        const message = decode(new Uint8Array(data));
        await messageReceiver.onReceiveMessage(message, client);
    });

    const serve = (mainObject: any): [MessageReceiver, any] => {
        messageReceiver.setMain(mainObject);
        return [messageReceiver, serve];
    };

    return serve;
}

// ---------------------------------------------------------------------------
// Client side — receives relay port via postMessage, connects via WS
// ---------------------------------------------------------------------------

export async function createMain(
    hostId: string,
    endpoint: PostMessageEndpoint,
): Promise<[Client, any]> {
    // Wait for the server to tell us the relay port
    const port = await new Promise<number>((resolve) => {
        endpoint.onMessage((msg) => {
            if (msg?.type === '__rpc_relay_port') resolve(msg.port);
        });
    });

    // Connect to the relay
    const ws = new WebSocket(`ws://localhost:${port}`);
    await new Promise<void>((resolve, reject) => {
        ws.onopen = () => resolve();
        ws.onerror = (e) => reject(e);
    });

    const client = new Client(hostId);
    const messageReceiver = new MessageReceiver(hostId);
    const sender = new WebSocketRelaySender(ws as any);
    client.setSender(() => sender);

    // Handle incoming WS messages
    ws.onmessage = async (ev: MessageEvent) => {
        const { decode } = await import('cbor-x');
        const data = ev.data instanceof ArrayBuffer ? new Uint8Array(ev.data) : ev.data;
        const message = decode(data);
        await messageReceiver.onReceiveMessage(message, client);
    };

    const main = await client.getMain();
    return [client, main];
}
