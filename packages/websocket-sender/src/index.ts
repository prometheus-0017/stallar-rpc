import { MessageReceiver, Client, type ISender, type Message } from "xuri-rpc";
import ReconnectingWebSocket from "reconnecting-websocket";
import { encode, decode } from "cbor-x";

/**
 * Prefix prepended to base64-encoded byte values inside JSON messages,
 * so the reviver can distinguish them from ordinary strings and restore
 * them back to Uint8Array.
 */
export const BYTES_PREFIX = "--^3jK7a%A8_Di0o77Z";

// ---------------------------------------------------------------------------
// Base64 helpers (works in both browser and Node.js)
// ---------------------------------------------------------------------------

export function uint8ToBase64(bytes: Uint8Array): string {
    // Browser path
    if (typeof btoa === "function") {
        let binary = "";
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }
    // Node.js path
    return Buffer.from(bytes).toString("base64");
}

export function base64ToUint8(b64: string): Uint8Array {
    if (typeof atob === "function") {
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }
    return new Uint8Array(Buffer.from(b64, "base64"));
}

// ---------------------------------------------------------------------------
// JSON serializer / deserializer with base64 for Uint8Array
// ---------------------------------------------------------------------------

/** JSON replacer – converts Uint8Array to prefixed base64 string. */
export function jsonReplacer(_key: string, value: any): any {
    if (value instanceof Uint8Array) {
        return BYTES_PREFIX + uint8ToBase64(value);
    }
    return value;
}

/** JSON reviver – restores prefixed base64 strings back to Uint8Array. */
export function jsonReviver(_key: string, value: any): any {
    if (typeof value === "string" && value.startsWith(BYTES_PREFIX)) {
        return base64ToUint8(value.slice(BYTES_PREFIX.length));
    }
    return value;
}

/** Serialize a Message to the text wire format (JSON with prefixed-base64 bytes). */
export function encodeTextMessage(message: Message): string {
    return JSON.stringify(message, jsonReplacer);
}

// ---------------------------------------------------------------------------
// Message deserialization
// ---------------------------------------------------------------------------

/** Deserialize a text wire message back to a Message. */
export function getMessageFromText(raw: string): Message {
    return JSON.parse(raw, jsonReviver) as Message;
}

/** Deserialize a binary (CBOR) wire message back to a Message. */
export function getMessageFromByte(data: ArrayBuffer | Uint8Array): Message {
    const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
    return decode(bytes) as Message;
}

// ---------------------------------------------------------------------------
// Binary Sender (CBOR)
// ---------------------------------------------------------------------------
//记录一下这一次的bug。直观上来看，这是由于每一次调用callback的时候。都指向了最初始的那个ID造成的问题。实际上为什么多次登录页面会获得同样ID的东西，是因为。前端网页设置了固定的host ID和顺序的ID生成。然而实际上应当理解为每一个网页都是新的实例。这里不一致，出现了问题。还有就是当host发生啊。当连接中断以后重新连接的时候需要考虑的情况不仅仅是。客户端的连接和服务端的连接。还有一种情况是已经储存的远程对象，它当中还持有了原来的client。你改的时候。只改了被调用回答的这一侧的获取client的方式实际上是无效的。你应该去改掉放在远程对象里的连接方式。
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
// Text Sender (JSON + base64)
// ---------------------------------------------------------------------------
export class WebSocketTextSender implements ISender {
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
        this.rws.send(encodeTextMessage(message));
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
 * @param mode  - `'binary'` (default) uses CBOR encoding;
 *                `'text'` uses JSON with base64-encoded bytes;
 *                byte values are prefixed with `BYTES_PREFIX` for round-trip.
 *
 * Usage::
 *
 *     const [client, main] = await createMain('myClient', 'localhost', 8765);
 *     const [client, main] = await createMain('myClient', 'localhost', 8765, '/', 'text');
 *     const result = await main.hello('world');
 */
export async function createMain(
    hostId: string,
    host: string = "localhost",
    port: number = 8765,
    path: string = "/",
    mode: "binary" | "text" = "binary",
): Promise<[Client, any]> {
    const url = `ws://${host}:${port}${path}`;
    const rws = new ReconnectingWebSocket(url);
    rws.binaryType = "arraybuffer";

    const client = new Client(hostId);
    const messageReceiver = new MessageReceiver(hostId);

    const sender: WebSocketBinarySender | WebSocketTextSender =
        mode === "text" ? new WebSocketTextSender(rws) : new WebSocketBinarySender(rws);
    client.setSender(() => sender);

    rws.onmessage = (event: MessageEvent) => {
        const data = event.data;
        const message: Message =
            typeof data === "string" ? getMessageFromText(data) : getMessageFromByte(data);

        const meta = message.meta || {};
        if (meta.sessionId) {
            sender.sessionId = meta.sessionId;
        }
        messageReceiver.onReceiveMessage(message, client);
    };

    await new Promise<void>((resolve, reject) => {
        rws.onopen = () => resolve();
        rws.onerror = (e) => reject(e);
    });

    const main = await client.getMain();
    return [client, main];
}
