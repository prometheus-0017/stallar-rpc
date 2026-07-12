import { MessageReceiver, Client, type ISender, type Message } from "xuri-rpc";
import ReconnectingWebSocket from "reconnecting-websocket";
import { encode, decode } from "cbor-x";

// ---------------------------------------------------------------------------
// Sender
// ---------------------------------------------------------------------------

export class WebSocketBinarySender implements ISender {
    private rws: ReconnectingWebSocket;
    private _sessionId: string | null | (() => string | null) = null;
    /** sessionId → sender mapping for server-side multi-connection routing */
    sessionSenderMap: Map<string, ISender> = new Map();

    constructor(rws: ReconnectingWebSocket, sessionId?: string | (() => string | null)) {
        this.rws = rws;
        this._sessionId = sessionId ?? null;
    }

    get sessionId(): string | null {
        return typeof this._sessionId === 'function' ? this._sessionId() : this._sessionId;
    }

    set sessionId(val: string | null) {
        this._sessionId = val;
    }

    send(message: Message) {
        const sid = this.sessionId;
        if (sid && !message.meta.sessionId) {
            message.meta.sessionId = sid;
        }
        this.rws.send(encode(message));
    }
}

// ---------------------------------------------------------------------------
// Client side
// ---------------------------------------------------------------------------

/**
 * Connect to a WebSocket-based RPC server with automatic reconnection.
 *
 * Returns `[client, mainProxy]`.
 *
 * Uses CBOR binary encoding for all messages.
 *
 * Usage::
 *
 *     const [client, main] = await createMain('myClient', 'localhost', 8765);
 *     const result = await main.hello('world');
 */
export async function createMain(
    hostId: string,
    host: string = "localhost",
    port: number = 8765,
    path: string = "/",
): Promise<[Client, any]> {
    const url = `ws://${host}:${port}${path}`;
    const rws = new ReconnectingWebSocket(url);
    rws.binaryType = "arraybuffer";

    const client = new Client(hostId);
    const messageReceiver = new MessageReceiver(hostId);
    const sender = new WebSocketBinarySender(rws);
    // setSender accepts a useSender function
    client.setSender(() => sender);

    rws.onmessage = (event: MessageEvent) => {
        const data = event.data;
        const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
        const message = decode(bytes);
        // Extract sessionId from meta and update sender
        const meta = message.meta || {};
        if (meta.sessionId) {
            sender.sessionId = meta.sessionId;
        }
        messageReceiver.onReceiveMessage(message, client);
    };

    // Wait for connection to be established before getting main
    await new Promise<void>((resolve, reject) => {
        rws.onopen = () => resolve();
        rws.onerror = (e) => reject(e);
    });

    const main = await client.getMain();
    return [client, main];
}
