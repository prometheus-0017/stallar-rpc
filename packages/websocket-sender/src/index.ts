import { MessageReceiver, Client, type ISender, type Message } from "xuri-rpc";
import ReconnectingWebSocket from "reconnecting-websocket";
import { encode, decode } from "cbor-x";

// ---------------------------------------------------------------------------
// Sender
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
