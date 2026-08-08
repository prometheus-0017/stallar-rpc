# xuri-rpc

xuri-rpc 是一款支持传递对象和回调的 RPC 框架。对象并不会真正迁移——实际的计算仍然发生在原始位置，远程端获得的是一个代理，调用代理的方法会转发到本体执行。

支持 JavaScript（TypeScript）和 Python 两种语言环境。

## 核心特点

- 像调用本地对象一样调用远程方法，不限于预声明的接口
- 支持在 RPC 调用中传递回调函数和可调用对象
- 传输层无关——WebSocket、TCP、postMessage、chrome.runtime、进程 IPC 均可接入
- 对象先携带元信息返回，再被调用，避免了传统 HTTP 接口 404 却找不到原因的困境

## 安装

```bash
npm install xuri-rpc
```

传输层包（按需安装）：

```bash
npm install @xuri-rpc/websocket-sender     # WebSocket + CBOR
npm install @xuri-rpc/message-sender       # postMessage (Worker / iframe) + WS relay
npm install @xuri-rpc/chrome-extension-sender  # Chrome 扩展消息通道
```

## 项目结构

```
xuri-rpc                              # 核心包（处理逻辑、代理、消息分发）
├── packages/
│   ├── websocket-sender              # WebSocket 传输（CBOR 二进制编码）
│   ├── message-sender                # postMessage 传输（Worker / iframe）
│   └── chrome-extension-sender       # Chrome 扩展传输
├── src/
│   ├── index.ts                      # 公开导出
│   ├── rpc.ts                        # 核心实现
│   └── localSerializationSender.ts   # 进程内测试通道 (DumpChannel)
└── __tests__/                        # 测试用例
```

## 核心概念

### Host（主机）

Host 是一个逻辑节点。每个 host 拥有唯一的 `hostId`，在整个分布式系统中必须唯一。

典型场景：每打开一个网页就是一个新实例，必须使用不同的 hostId，否则消息会串发到旧页面。

一个进程内可以有多个 host，对应多组 RPC 连接。

### 参数类型：Data vs Proxy

RPC 调用中的参数分为两类：

- **Data 类型**：纯数据——字符串、数字、布尔值、null、普通对象、数组、Uint8Array。按值序列化传输。
- **Proxy 类型**：承载行为的对象或函数。不会序列化，而是在远端生成一个代理。调用代理的方法会触发本体执行。

使用 `asProxy()` 显式标记一个参数为 proxy 类型。

### ISender（传输接口）

所有传输层都实现 `ISender` 接口：

```typescript
interface ISender {
    send(message: Request | Response): void
}
```

你只需实现这个接口就能接入任意传输方式。

### 上下文模式和无上下文的模式

需要补全

---

## API 参考

### 核心包 `xuri-rpc`

#### `setHostId(id: string): void`

设置默认 host 的名称。通常在整个程序入口处调用一次。

```typescript
import { setHostId } from 'xuri-rpc'
setHostId('backend')
```

#### `getMessageReceiver(): MessageReceiver`

获取全局单例 `MessageReceiver`。首次调用时自动创建。

#### `MessageReceiver`

消息分发器，负责接收消息并委派给对应对象处理。

```typescript
class MessageReceiver {
    constructor(hostId?: string)

    // 注册 main 对象（入口对象，id 为 'main'）
    setMain(obj: Record<string, Function>): void

    // 注册一个命名对象。withContext=true 时启用上下文/拦截器机制
    setObject(id: string, obj: Record<string, Function>, withContext: boolean): void

    // 添加拦截器（中间件），洋葱模型，类似 Koa
    addInterceptor(interceptor: Interceptor): void

    // 处理收到的消息。clientForCallBack 用于发送响应
    onReceiveMessage(message: Request | Response, clientForCallBack: Client): Promise<void>

    // 设置结果自动包装函数（对返回值做自动 proxy 转换等）
    setResultAutoWrapper(autoWrapper: (x: any) => any): void
}
```

**拦截器签名：**

```typescript
type Interceptor = (
    context: Record<string, any>,
    message: Request,
    client: Client,
    next: () => Promise<void>
) => Promise<void>
```

拦截器仅在通过 `setObject(id, obj, true)` 注册的对象上生效。context 字典会作为第一个参数传入被调用的方法。

#### `Client`

RPC 端点，既用于发送请求也用于接收响应。

```typescript
class Client {
    constructor(hostId?: string)

    // 设置发送器。参数是一个返回 ISender 的函数
    setSender(useSender: () => ISender): void

    // 获取远程 main 对象（等价于 getObject('main')）
    getMain(): Promise<any>

    // 获取远程命名对象
    getObject(objectId: string): Promise<any>

    // 设置参数自动包装（自动将函数等转为 proxy）
    setArgsAutoWrapper(autoWrapper: (x: any) => any): void
}
```

#### `asProxy(obj: object, hostIdFrom?: string): PreArgObj`

将一个对象标记为 proxy 类型参数。返回 `PreArgObj` 实例，在序列化时会被转换为代理描述符。

```typescript
import { asProxy } from 'xuri-rpc'

// 传递回调
await remoteObj.method(asProxy((result) => console.log(result)))

// 传递一个对象
await remoteObj.method(asProxy({ onClick: () => {} }))
```

#### 类型定义

```typescript
// 消息类型
type Message = Request | Response

interface Request {
    id: string
    meta: Record<string, any>
    method: string
    objectId: string
    args: Array<ArgObj>
}

interface Response {
    id: string
    idFor: string          // 对应请求的 id
    meta: Record<string, any>
    status: number         // 200=成功, -1=异常, 100=对象未找到
    trace?: string         // 异常时的堆栈信息
    data?: ArgObj          // 返回数据
}

interface ISender {
    send(message: Request | Response): void
}
```

#### 代理管理器

```typescript
// 管理本地暴露给远端的对象（id ↔ 对象 的映射）
class ObjectOfProxyManager {   // 导出别名: PlainProxyManager
    set(obj: object, id: string): void
    getById(id: string): any
    get(obj: object): string
    has(obj: object): boolean
    deleteById(id: string): void
    delete(obj: object): void
    reRegister(id: string): void   // 刷新存活时间
}

// 管理从远端接收到的代理引用（使用 WeakRef）
class RemoteProxyManager {   // 导出别名: RunnableProxyManager
    set(id: string, proxy: RemoteProxy, client: Client): void
    get(id: string): RemoteProxy | null
}
```

#### 工具函数

```typescript
// 开启/关闭调试日志
setDebugFlag(flag: boolean): void

// 生成错误响应
generateErrorReply(message: Request, errorText: string, status?: number, hostId?: string): Response

// 清理过期代理对象（默认超时 30s）
removeOutdatedProxyObject(timeout?: number): void

// 获取所有 host 的代理持有信息（诊断用）
getProxyHoldingInfo(): Array<{ hostId: string, count: number, earliestDate: Date }>

// 重新注册存活的远程代理（心跳）
autoReRegister(): Promise<void>

// 启动自动维护定时器（GC + 心跳 + 超时清理，每 3 秒）
autoCheck(): void

// 手动删除代理
_deleteProxyById(id: string, hostId?: string): void
_deleteProxy(obj: object, hostId?: string): void
```

---

### `@xuri-rpc/websocket-sender`

基于 WebSocket + CBOR 二进制编码的传输层，支持自动重连。

```typescript
import { createMain, WebSocketBinarySender } from '@xuri-rpc/websocket-sender'

// 客户端：一行代码连接到服务端
const [client, main] = await createMain('myClient', 'localhost', 8765)
const result = await main.hello('world')
```

**`createMain(hostId, host?, port?, path?)`** — 创建客户端连接，返回 `[Client, mainProxy]`。

**`WebSocketBinarySender`** — ISender 实现，使用 CBOR 编码。支持 `sessionId` 用于服务端多连接路由。

服务端需要自行使用 `ws` 库 + `MessageReceiver` 搭建，用 `decode/encode` 处理 CBOR 消息。

---

### `@xuri-rpc/message-sender`

基于 `postMessage` 的传输层，适用于 Web Worker 和 iframe 场景。通过 postMessage 交换 WebSocket relay 端口，之后实际 RPC 流量走 CBOR WebSocket 帧。

```typescript
import { workerEndpoint, iframeEndpoint, iframeChildEndpoint, createServer, createMain } from '@xuri-rpc/message-sender'
```

**端点工厂：**

| 函数 | 使用位置 | 说明 |
|---|---|---|
| `workerEndpoint(worker?)` | Worker 内部 | 封装 `self.postMessage` |
| `iframeEndpoint(iframe, origin?)` | 父页面 | 封装 `iframe.contentWindow.postMessage` |
| `iframeChildEndpoint(origin?)` | iframe 内部 | 封装 `window.parent.postMessage` |
| `chromeExtensionPortEndpoint(port)` | Chrome 扩展 | 封装长连接 port |

**`PostMessageEndpoint` 接口：**

```typescript
interface PostMessageEndpoint {
    postMessage(msg: any): void
    onMessage(handler: (msg: any) => void): void
}
```

**`createServer(hostId, endpoint)`** — 服务端。启动 WS relay，通过 postMessage 告知客户端端口。返回 `serve` 函数。

**`createMain(hostId, endpoint)`** — 客户端。接收 relay 端口，建立 WS 连接。返回 `[Client, mainProxy]`。

---

### `@xuri-rpc/chrome-extension-sender`

Chrome 扩展消息通道传输层。使用 `chrome.runtime.sendMessage`（请求-响应模式）。

```typescript
import { createServer, createMain } from '@xuri-rpc/chrome-extension-sender'

// 背景脚本 (background / service worker)
const serve = createServer('background')
serve({ myMethod() { return 'hello' } })

// 内容脚本 / popup
const [client, main] = await createMain('contentScript')
const result = await main.myMethod()
```

**`createServer(hostId)`** — 在背景脚本中调用，返回 `serve` 函数。

**`createMain(hostId)`** — 在内容脚本/popup 中调用，返回 `[Client, mainProxy]`。

---

## 快速开始

以下示例展示如何基于 WebSocket 搭建完整的 RPC 服务端和客户端。核心模式只有三步：

1. **实现 ISender**：将 RPC 消息通过你的传输方式发出去
2. **接收消息**：将收到的数据反序列化后交给 `MessageReceiver.onReceiveMessage()`
3. **注册对象**：通过 `setMain()` / `setObject()` 注册可被远程调用的对象

### 示例 1：基本 RPC 调用

**服务端 (server.ts)**

```typescript
import { setHostId, getMessageReceiver, Client } from 'xuri-rpc'
import { WebSocketServer } from 'ws'
import { encode, decode } from 'cbor-x'

setHostId('backend')

// 注册入口对象
getMessageReceiver().setMain({
    add(a: number, b: number) {
        return a + b
    },
    greet(name: string) {
        return `Hello, ${name}!`
    }
})

const wss = new WebSocketServer({ port: 8765 })

wss.on('connection', (ws) => {
    // 为每个连接创建一个 Client（用于发送响应）
    const client = new Client()

    // 实现 ISender：将消息序列化后通过 WebSocket 发出
    client.setSender(() => ({
        send(message) {
            ws.send(encode(message))
        }
    }))

    // 收到消息后，反序列化并交给 MessageReceiver 处理
    ws.on('message', (data) => {
        getMessageReceiver().onReceiveMessage(decode(new Uint8Array(data)), client)
    })
})
```

**客户端 (client.ts)**

```typescript
import { setHostId, getMessageReceiver, Client } from 'xuri-rpc'
import WebSocket from 'ws'
import { encode, decode } from 'cbor-x'

setHostId('frontend')

async function main() {
    const client = new Client()
    const ws = new WebSocket('ws://localhost:8765')

    // 等待连接建立
    await new Promise<void>((resolve, reject) => {
        ws.on('open', () => resolve())
        ws.on('error', reject)
    })

    // 实现 ISender
    client.setSender(() => ({
        send(message) {
            ws.send(encode(message))
        }
    }))

    // 接收服务端响应
    ws.on('message', (data) => {
        getMessageReceiver().onReceiveMessage(decode(new Uint8Array(data)), client)
    })

    // 获取远程 main 对象并调用
    const remoteMain = await client.getMain()
    console.log(await remoteMain.add(1, 2))       // 3
    console.log(await remoteMain.greet('world'))   // "Hello, world!"
}
main()
```

> 也可以使用 `@xuri-rpc/websocket-sender` 简化客户端：
> ```typescript
> import { createMain } from '@xuri-rpc/websocket-sender'
> const [client, main] = await createMain('frontend', 'localhost', 8765)
> console.log(await main.add(1, 2))
> ```

### 示例 2：传递回调

回调函数直接传递即可，框架会自动将其转为代理：

**服务端**

```typescript
getMessageReceiver().setMain({
    compute(a: number, b: number, onProgress: any) {
        onProgress(a + b)   // 调用客户端传来的回调
        return a * b
    }
})
```

**客户端**

```typescript
const remoteMain = await client.getMain()

// 直接传递函数，框架自动代理
const result = await remoteMain.compute(3, 4, (val: number) => {
    console.log('进度:', val)  // 先输出: 进度: 7
})
console.log('结果:', result)   // 输出: 结果: 12
```

也可以用 `asProxy()` 显式标记（需传入当前 hostId）：

```typescript
import { asProxy } from 'xuri-rpc'

const result = await remoteMain.compute(3, 4,
    asProxy((val: number) => console.log('进度:', val), 'frontend')
)
```

### 示例 3：返回远程对象

服务端方法返回一个对象，客户端获得它的代理，调用方法会转发回服务端执行。

**服务端**

```typescript
import { asProxy } from 'xuri-rpc'

getMessageReceiver().setMain({
    getCalculator() {
        // 注意：服务端使用 asProxy 时必须传入 server 的 hostId
        return asProxy({
            multiply(a: number, b: number) { return a * b },
            divide(a: number, b: number) {
                if (b === 0) throw new Error('除数不能为零')
                return a / b
            }
        }, 'backend')
    }
})
```

**客户端**

```typescript
const remoteMain = await client.getMain()
const calc = await remoteMain.getCalculator()

console.log(await calc.multiply(6, 7))  // 42

try {
    await calc.divide(10, 0)
} catch (e: any) {
    console.log(e.status)  // -1
    console.log(e.trace)   // "Error: 除数不能为零\n  at ..."
}
```

### 示例 4：函数代理（`__call__`）

返回一个可直接调用的函数（而非对象的方法）：

**服务端**

```typescript
import { asProxy } from 'xuri-rpc'

getMessageReceiver().setMain({
    getMultiplier() {
        return asProxy((a: number, b: number) => a * b, 'backend')
    },
    getCounter() {
        let count = 0
        return asProxy(() => ++count, 'backend')
    }
})
```

**客户端**

```typescript
const remoteMain = await client.getMain()

const multiplier = await remoteMain.getMultiplier()
console.log(await multiplier(3, 4))  // 12

const counter = await remoteMain.getCounter()
console.log(await counter())  // 1
console.log(await counter())  // 2
console.log(await counter())  // 3
```

### 示例 5：上下文与拦截器

拦截器以洋葱模型运行（类似 Koa），`context` 字典作为第一个参数传入被调用的方法。

**服务端**

```typescript
import { setHostId, getMessageReceiver, Client } from 'xuri-rpc'
import { WebSocketServer } from 'ws'
import { encode, decode } from 'cbor-x'

setHostId('backend')

const receiver = getMessageReceiver()
receiver.setMain({})

// 注册启用上下文的对象（第三个参数 true）
receiver.setObject('userService', {
    getUser(context: any, userId: number) {
        // context 由拦截器填充
        return {
            id: userId,
            requestedBy: context.userId,
            role: context.role
        }
    },
    updateUser(context: any, userId: number, updates: any) {
        if (context.role !== 'admin') {
            throw new Error('权限不足')
        }
        return { success: true, userId, updates }
    }
}, true)

// 拦截器 1：添加时间戳
receiver.addInterceptor(async (context, message, client, next) => {
    context.timestamp = new Date().toISOString()
    await next()
})

// 拦截器 2：身份验证
receiver.addInterceptor(async (context, message, client, next) => {
    context.userId = 1001
    context.role = 'admin'
    await next()
})

const wss = new WebSocketServer({ port: 8765 })
wss.on('connection', (ws) => {
    const client = new Client()
    client.setSender(() => ({
        send(message) { ws.send(encode(message)) }
    }))
    ws.on('message', (data) => {
        receiver.onReceiveMessage(decode(new Uint8Array(data)), client)
    })
})
```

**客户端**

```typescript
const remoteMain = await client.getMain()

// 获取命名对象
const userService = await client.getObject('userService')

const user = await userService.getUser(42)
// { id: 42, requestedBy: 1001, role: 'admin' }

const result = await userService.updateUser(42, { name: 'Alice' })
// { success: true, userId: 42, updates: { name: 'Alice' } }
```

6:超时控制

需要补充,包括kill过程,更新时间戳过程,和自动kill机制,包括定时的远程对象清理和定时的等待链接关闭

---

## RPC 调用流程

一次完整的 RPC 调用：

1. 客户端调用远程代理对象的方法
2. `Client` 将参数序列化（`toArgObj`），组装 `Request` 消息
3. 通过 `ISender.send()` 发送消息，Promise 挂起等待
4. 服务端 `MessageReceiver.onReceiveMessage()` 收到消息
5. 根据 `objectId` 查找本地对象，反序列化参数
6. 调用目标方法，获取返回值
7. 将结果序列化，通过 `Client` 的 sender 发送 `Response`
8. 客户端 `MessageReceiver` 收到响应，匹配 `idFor`，resolve Promise

## Host 与多连接

默认情况下调用 `setHostId()` 设置全局默认 host。如果需要多组独立的 RPC 连接：

```typescript
// 每组连接使用不同的 hostId
const receiver1 = new MessageReceiver('connection-a')
const client1 = new Client('connection-a')

const receiver2 = new MessageReceiver('connection-b')
const client2 = new Client('connection-b')
```

每个 `MessageReceiver` 和 `Client` 的 `hostId` 必须匹配，它们共享同一套代理管理器和请求队列。

## 错误处理

- 服务端方法抛出异常 → 客户端收到 `status: -1` 的响应，`trace` 包含堆栈信息
- 请求的 `objectId` 不存在 → 客户端收到 `status: 100` 的响应
- 请求超时（默认 30 秒） → Promise 被 reject，错误信息为 `'timeout'`

```typescript
try {
    await remoteObj.someMethod()
} catch (e) {
    if (e.status === -1) {
        console.error('服务端异常:', e.trace)
    } else if (e.status === 100) {
        console.error('对象不存在')
    }
}
```

## 许可证

MIT
