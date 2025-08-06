import { getMessageReceiver,Client,type ISender,type Message, MessageReceiver, PlainProxyManager, RunnableProxyManager, asProxy, setHostId } from "./rpc.js";
export class WebSocketSender implements ISender{
    wsConnection:WebSocketConnectionKeeper
    constructor(wsConnection:WebSocketConnectionKeeper){
        this.wsConnection=wsConnection
    }
    async send(message:Message){
        let connection=await this.wsConnection.getConnection()
        connection.send(JSON.stringify(message))
    }
}
export class WebSocketConnectionKeeper{
    host:string
    port:number
    path:string
    socket?:WebSocket
    lastTime=0;
    tryCount=0;
    client:Client
    
    constructor(host:string,port:number,path:string,client:Client){
        this.host=host
        this.port=port
        this.path=path
        this.client=client
    }
    url(){
        return `ws://${this.host}:${this.port}${this.path}`
    }
    async getConnection():Promise<WebSocket>{
        let socket=this.socket as WebSocket

        if(socket==null||socket!=null && socket.readyState==WebSocket.OPEN){
            return socket
        }

        while(socket.readyState!=WebSocket.OPEN){
            if(socket.readyState==WebSocket.CLOSED){
                if(Date.now()-this.lastTime>5000){
                    this.tryCount=0
                }
                if(this.tryCount<3){
                    socket=new WebSocket(this.url())
                    this.socket=socket
                    this.tryCount++
                }else{
                    throw  "socket is disconnected";
                }
            }
            await wait();
        }

        socket.onopen = function() {
            console.log("socket is open")
        };
        socket.onmessage = (event) =>{
            let data=event.data;
            let obj=JSON.parse(data);
            getMessageReceiver().onReceiveMessage(obj,this.client)
        };
        socket.onclose = function(event) {
        };
        socket.onerror = function(event) {
            console.log(event);
        };
        return socket;
    }
}

async function wait(){
    await new Promise((resolve, reject) => {
        setTimeout(() => resolve(null), 500)
    });
}