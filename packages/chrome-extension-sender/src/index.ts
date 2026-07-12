/**
 * Chrome extension messaging transport using ``chrome.runtime.sendMessage``
 * and ``chrome.runtime.onMessage`` (request-response pattern).
 *
 * This is fundamentally different from the postMessage-based transport in
 * ``messageSender.ts``:
 *
 * - ``chrome.runtime.sendMessage`` is a **request → response** call, not a
 *   bidirectional pipe.  Each call can carry a payload and receive exactly
 *   one reply (via ``sendResponse`` or a Promise).
 * - The background script typically acts as the **server** (exposes methods),
 *   while content scripts / popups act as the **client** (invoke methods).
 *
 * To achieve full-duplex RPC we layer two one-way channels on top:
 *
 * 1. **Client → Server** — ``chrome.runtime.sendMessage({ rpc: … })``
 * 2. **Server → Client** — the server stores a ``sendResponse`` callback
 *    (or uses ``chrome.tabs.sendMessage`` for content scripts) to push
 *    replies / callbacks back.
 *
 * For simplicity this implementation uses a *polling-style long response*:
 * the client sends a request and keeps the ``sendResponse`` channel open by
 * returning ``true`` from the listener (async sendResponse).
 */
import { MessageReceiver, Client, ISender, Message } from 'xuri-rpc';

// ---------------------------------------------------------------------------
// Types (minimal chrome API surface so we compile without @types/chrome)
// ---------------------------------------------------------------------------

interface ChromeRuntime {
    sendMessage(msg: any, cb?: (response: any) => void): void;
    onMessage: {
        addListener(
            cb: (
                message: any,
                sender: any,
                sendResponse: (response?: any) => void,
            ) => true | void | undefined,
        ): void;
    };
    // Available in background / service-worker context
    id?: string;
}

declare const chrome: { runtime: ChromeRuntime };

// ---------------------------------------------------------------------------
// Sender — wraps chrome.runtime.sendMessage as an ISender
// ---------------------------------------------------------------------------

class ChromeRuntimeSender implements ISender {
    async send(message: Message) {
        return new Promise<void>((resolve) => {
            chrome.runtime.sendMessage({ __rpc: true, payload: message }, () => resolve());
        });
    }
}

// ---------------------------------------------------------------------------
// Server side (typically background / service-worker script)
// ---------------------------------------------------------------------------

export function createServer(hostId: string): (mainObject: any) => [MessageReceiver, any] {
    const messageReceiver = new MessageReceiver(hostId);
    const client = new Client(hostId);

    // Pending response channels — keyed by a unique request id
    const pendingResponses = new Map<string, (response: any) => void>();

    // Set up the client-side sender (for server→client callbacks)
    let clientSender: ChromeCallbackSender | null = null;
    let lastSender: any = null;

    // Listen for incoming RPC calls from clients
    chrome.runtime.onMessage.addListener((message, msgSender, sendResponse) => {
        lastSender = msgSender;
        if (!message?.__rpc) return;

        const { payload, replyId } = message;

        // If this is a *reply* to a previous server→client call, resolve it
        if (message.__reply && replyId && pendingResponses.has(replyId)) {
            pendingResponses.get(replyId)!(message.payload);
            pendingResponses.delete(replyId);
            return;
        }

        // Otherwise it's a new RPC request — dispatch and reply async
        messageReceiver.onReceiveMessage(payload, client).then((result: any) => {
            sendResponse({ __rpc: true, __reply: true, payload: result });
        });

        return true; // keep the message channel open for async sendResponse
    });

    // When the server needs to call back the client, it uses the stored
    // sender.  The sender is captured when the first request arrives.
    const originalOnReceive = messageReceiver.onReceiveMessage.bind(messageReceiver);
    messageReceiver.onReceiveMessage = async (msg: Message, c: Client) => {
        if (!clientSender && lastSender?.tab) {
            clientSender = new ChromeCallbackSender(lastSender.tab.id);
            c.setSender(() => clientSender!);
        }
        return originalOnReceive(msg, c);
    };

    const serve = (mainObject: any): [MessageReceiver, any] => {
        messageReceiver.setMain(mainObject);
        return [messageReceiver, serve];
    };

    return serve;
}

// ---------------------------------------------------------------------------
// Sender for server → client (uses chrome.tabs.sendMessage)
// ---------------------------------------------------------------------------

class ChromeCallbackSender implements ISender {
    constructor(private tabId: number) {}

    async send(message: Message) {
        return new Promise<void>((resolve) => {
            (chrome as any).tabs.sendMessage(this.tabId, { __rpc: true, payload: message }, () => resolve());
        });
    }
}

// ---------------------------------------------------------------------------
// Client side (content script / popup / options page)
// ---------------------------------------------------------------------------

export async function createMain(hostId: string): Promise<[Client, any]> {
    const client = new Client(hostId);
    const messageReceiver = new MessageReceiver(hostId);
    const sender = new ChromeRuntimeSender();
    client.setSender(() => sender);

    // Listen for server→client messages (callbacks, replies)
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (!message?.__rpc) return;
        if (message.__reply) return; // handled elsewhere

        // Server is calling back to us
        messageReceiver.onReceiveMessage(message.payload, client);
        return true; // async
    });

    const main = await client.getMain();
    return [client, main];
}
