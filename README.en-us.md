# xuri-rpc

xuri-rpc is an RPC framework that superficially supports object and callback passing. In reality, however, no actual object migration occurs—the computation still takes place at its original location.

Currently, only methods on objects can be passed; passing attributes is not supported.

Supports both JavaScript and Python environments.

## Features

* Use remote objects as if they were local, without being limited to pre-declared objects.
* Since the object first returns to the local side with its information before you proceed to invoke methods, this greatly reduces the frustration of calling an HTTP request only to get a 404 error without knowing exactly what went wrong. If you can't find the issue this time, at least you can see what options are still available.
* Not limited to a specific underlying communication method—you can use WebSocket, TCP, inter-process communication, integrate into existing services, or even polling-based HTTP.
  * For dedicated WebSocket usage, we've implemented a WebSocket-based client.
  * For other cases, you may need to: 1) maintain a connection, 2) implement a sender for the client. Connection maintenance is unrelated to this framework, except that you need to forward messages received on the connection to the framework. For the sender, you won't need to do much.

## Use Cases

* Communication between browser workers
* Communication between iframes
* Communication between browser frontend and backend

## Installation

```
npm install xuri-rpc
```

## Examples

The examples use WebSocket as the message carrier. You'll need to set this up yourself.

### Using the RPC framework to execute a remote procedure and trigger a callback

**Server**

```
import { PlainProxyManager,RunnableProxyManager,MessageReceiver,Client,asProxy,getMessageReceiver,setHostId } from 'xuri-rpc'
import { WebSocketServer } from 'ws'

// Set hostName
setHostId('backend')
// Create a Sender
class Sender{
    constructor(ws){
        this.ws=ws
    }
    async send(message){
        this.ws.send(JSON.stringify(message))
    }
}
// Set the main object that provides initial methods
getMessageReceiver().setMain({
    plus(a,b,callback){
        let r=a+b
        callback(r)
        return r
    }
})


const wss = new WebSocketServer({ port: 18081 });
wss.on('connection', (ws, request) => {
  
  // Create a client for sending return messages
  let client=new Client()
  client.setSender(new Sender(ws))

  ws.on('message', (data) => {

    // Here handle message
    // Process received messages
    getMessageReceiver().onReceiveMessage(JSON.parse(data),client)

  });

  ws.on('error', (error) => {
    console.error('Client connection error:', error);
  });

});

wss.on('error', (error) => {
  console.error('Server error:', error);
});
```

**Client**

```
import { PlainProxyManager,RunnableProxyManager,MessageReceiver,Client,asProxy,getMessageReceiver,setHostId } from 'xuri-rpc'
import {WebSocket} from 'ws'

// Define a sender
class Sender {
  constructor(ws) {
    this.ws=ws
  }
  async send(message) {
    // message is an object that can be JSONified
    this.ws.send(JSON.stringify(message))
  }
}
async function main(){

    setHostId('frontend')
    let client=new Client()
    
    
    const ws = new WebSocket('ws://localhost:18081');
    await new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });
    ws.on('message', (data) => {
      getMessageReceiver().onReceiveMessage(JSON.parse(data),client)
      console.log(`Received server message: ${data}`);
    });
    client.setSender(new Sender(ws))
    

    let main=await client.getMain()
    let result=await main.plus(1,2,asProxy((result)=>console.log('from callback',result)))
    console.log('from rpc',result)
}
main()
```



Using multiple RPC groups.

### Passing a context variable during invocation

First, the object you define should accept a dictionary as its first parameter to represent the context.

**Server**

```
import { PlainProxyManager,RunnableProxyManager,MessageReceiver,Client,asProxy,getMessageReceiver,setHostId } from 'xuri-rpc'
import { WebSocketServer } from 'ws'

// Set hostName
setHostId('backend')
// Create a Sender
class Sender{
    constructor(ws){
        this.ws=ws
    }
    async send(message){
        this.ws.send(JSON.stringify(message))
    }
}
// Set the main object that provides initial methods
getMessageReceiver().setMain({
})
getMessageReceiver().setObject("greeting",{
  greeting(context){
    return `hi,${context.a} and ${context.b}`
  }
},true)
getMessageReceiver().addInterceptor(async (context,message,client,next)=>{
  context.a='mike'
  await next()
})
getMessageReceiver().addInterceptor(async (context,message,client,next)=>{
  context.b='john'
  await next()
})


const wss = new WebSocketServer({ port: 18081 });
wss.on('connection', (ws, request) => {
  
  // Create a client for sending return messages
  let client=new Client()
  client.setSender(new Sender(ws))

  ws.on('message', (data) => {

    // Here handle message
    // Process received messages
    getMessageReceiver().onReceiveMessage(JSON.parse(data),client)

  });

  ws.on('error', (error) => {
    console.error('Client connection error:', error);
  });

});

wss.on('error', (error) => {
  console.error('Server error:', error);
});
```

**Client**

```
import { PlainProxyManager,RunnableProxyManager,MessageReceiver,Client,asProxy,getMessageReceiver,setHostId } from 'xuri-rpc'
import {WebSocket} from 'ws'

// Define a sender
class Sender {
  constructor(ws) {
    this.ws=ws
  }
  async send(message) {
    // message is an object that can be JSONified
    this.ws.send(JSON.stringify(message))
  }
}
async function main(){

    setHostId('frontend')
    let client=new Client()
    
    
    const ws = new WebSocket('ws://localhost:18081');
    await new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });
    ws.on('message', (data) => {
      getMessageReceiver().onReceiveMessage(JSON.parse(data),client)
      console.log(`Received server message: ${data}`);
    });
    client.setSender(new Sender(ws))
    

    let main=await client.getObject('greeting');
    let result=await main.greeting()
    console.log(result)
}
main()
```

## Tutorial

### Basic Message Sending Flow

An RPC call should include the following steps:

- A method on a remote object (obtained from some client) is invoked.
- The proxy of this remote object calls the client to encapsulate a series of methods, ultimately forming a request (Response) message (Message).
- The client calls its assigned ISender to send the message. This remote method blocks here asynchronously.
- The receiver on the receiving end receives the message and delegates it to the corresponding object for processing. When the receiver accepts a message, it should synchronously pass a client for responding.
- When the delegated object finishes processing, it returns the result.
- The result is sent back to the requesting side through the response client.
- Upon receiving the message, the receiver on the requesting side resolves or rejects the promise, completing this round of request.

### Classic Usage Flow

See examples for complete code.

**Server**

```

// Set host ID
setHostId('backend')

// Set the main object that provides initial methods. In this object, you should add methods that return more remote objects, or you can directly implement some business logic calls here.
getMessageReceiver().setMain({
})

// You create some message channel, deserialize the received information, and pass it to MessageReceiver. When passing the received message to MessageReceiver, you also need to pass a client simultaneously, as you need something to send the return result back.
const wss = new WebSocketServer({ port: 18081 });
wss.on('connection', (ws, request) => {
  
  // Create a client for sending return messages
  let client=new Client()
  client.setSender(new Sender(ws))

  ws.on('message', (data) => {

    // Here handle message
    // Process received messages
    getMessageReceiver().onReceiveMessage(JSON.parse(data),client)

  });

});
```

**Client**

```

// Define a sender. Serialize a message object and send it through some underlying transport mechanism, such as a process pipe or a WebSocket connection.
class Sender {
  constructor(ws) {
    this.ws=ws
  }
  async send(message) {
    // message is an object that can be JSONified
    this.ws.send(JSON.stringify(message))
  }
}

// Set host ID.
setHostId('frontend')
// Create a client, which handles the complex operations of RPC calls.
let client=new Client()



// Create a channel. This channel is used both for sending messages and receiving return results.
const ws = new WebSocket('ws://localhost:18081');
await new Promise((resolve, reject) => {
  ws.on('open', resolve);
  ws.on('error', reject);
});
ws.on('message', (data) => {
  // Create a receiver—you need somewhere to receive return results for what you send, right?
  getMessageReceiver().onReceiveMessage(JSON.parse(data),client)
  console.log(`Received server message: ${data}`);
});
// Bind the corresponding sender to the client
client.setSender(new Sender(ws))


// Get the main object
let main=await client.getMain()
// The main object is a remote object defined on the server side. You should obtain your defined functions from here. Call these functions to get further remote objects or execute some business logic.
let result=await main.plus(1,2,asProxy((result)=>console.log('from callback',result)))

```



### Host

This concept is equivalent to a logical host. Normally, it should correspond to your program. However, if your program might need multiple RPC connections, each connection should correspond to such a logical host.

You should give your host a name, which should be unique across your entire distributed system. setHostId accepts a string parameter to specify the default host name. Usually, you should call this method exactly once.

For cases with multiple RPC connections (i.e., needing to set multiple hosts), you can pass a string parameter to the constructor of Client or Receiver to specify the host to which this client or receiver belongs.

### asProxy

Parameters passed to a remote object can be categorized as data type or proxy type.

Data type objects are fully data-representing objects, such as strings, dictionaries, or other nested/complex structures, which can be serialized in a deterministic way. During actual system operation.

Proxy type objects will be replicated to the remote end and processed there. It's recommended that these objects be immutable. Proxy type objects are typically the main structures responsible for carrying computations and system logic, often having extensive associations, making them unsuitable or impossible to serialize. During system execution, such an object will generate a proxy object sent to the remote side. The remote host calls the proxy object to control the execution of the original object's specific functions.

Although we provide a way to call remote objects, in principle, we don't recommend frequently creating and using remote objects, because it's impossible to treat remote and local objects identically. First, we don't provide a robust mechanism for unloading remote objects—there's no automatic garbage collection system. This could lead to memory leaks in some sense. Second, due to communication latency, calling remote methods may reduce program efficiency.

We provide an asProxy function to explicitly declare that a parameter passed to a remote method is of proxy type. Internally, it returns a representation object of a proxy type object, which is an instance of PreArgObj.

We also provide a setArgsAutoWrapper function on the client. If in your system you can determine that parameters of a certain pattern are definitely of proxy type, you can pass a function as a parameter to this function to achieve automatic conversion. Note that you should exclude results returned by asProxy.

### Context, Interceptor & setObject

We might face a scenario where, for all requests, we need to perform some preparatory tasks before the request is actually processed, such as creating a database session.

We refer to this mechanism as "context." The context should be accessible at any point throughout the entire request processing flow.

However, implementing this mechanism is challenging in asynchronous scenarios, especially since browsers currently do not support a persistent global dictionary in asynchronous environments.

As an alternative, we've introduced a mechanism where the function responsible for handling the request receives a dictionary representing the context as its first parameter. When building the server, request pre- and post-processing mechanisms can be added by calling the `addInterceptor` method, which uses `await next()` to invoke subsequent processing. The remote end using this method only needs to pass parameters normally. However, when the server processes the request, it will prepend a context parameter.

The specific process is as follows:

Server

```javascript
// Set an object on the message server. Note that the first parameter of every method on this object is a context.
// Also, the third parameter of setObject is true, indicating that this object uses the context mechanism.
getMessageReceiver().setObject("greeting", {
  greeting(context) {
    return `hi, ${context.a} and ${context.b}`;
  }
}, true);

// Add an interceptor. Each interceptor is a method declared as follows.
// Parameters are: context, current message, client, and next (to invoke the next interceptor or the actual function).
getMessageReceiver().addInterceptor(async (context, message, client, next) => {
  context.a = 'mike'; // Context is a dictionary; you can add any necessary processing here.
  await next(); // Call the next layer
});
```

Client

```javascript
// Obtain an object with context functionality via getObject.
let main = await client.getObject('greeting');
// When calling the function, there's no need to pass the context parameter.
let result = await main.greeting();
```

For the complete code, please refer to the example.
