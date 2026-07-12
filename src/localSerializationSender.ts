import { MessageReceiver,Client,Message,ISender } from "./rpc";
import {encode,decode} from 'cbor-x'
class LocalSerializationSender implements ISender{
    channel:DumpChannel;
    dir:'toServer'|'toClient';
    constructor(dumpChannel:DumpChannel,dir:'toServer'|'toClient'){
        this.dir=dir
        this.channel=dumpChannel
    }
    async send(message:Message){
        let dumped=encode(message)
        if(this.dir=='toServer'){
            this.channel.sendToServer(dumped)
        }else{
            this.channel.sendToClient(dumped)
        }
    }
}
/**
 * createServer应当返回一个tuple,tule的第一个元素应该是服务函数剩下的元素可以根据需要来追加，比如说底层的连接对象。
 * 调用这个函数，启动服务过程。
 * 对于独占一个连接的情况，比如说独自启动一个web socket，它会产生一种阻塞，那么此时这个返回的函数也应当是阻塞的。可以是阻塞的情况，也可以是asynchronized的情况。
 * 如果它是某一种处理器。那么这个函数应该返回的是这个处理器。
 * 你现在需要检查所有的websocket, stdio,以及其他所有非测试的sender是否有这个问题
 * @param hostId 
 * @param channel 
 * @returns 
 */
export async function createServer(hostId:string,channel:DumpChannel){
    let messageReceiver:MessageReceiver=new MessageReceiver(hostId)
    let client=new Client(hostId)
    const sender=new LocalSerializationSender(channel,'toClient')
    client.setSender(()=>sender)
    channel.setServerSide(messageReceiver,client)
    const serve=(mainObject:any)=>{
        messageReceiver.setMain(mainObject)
        return [messageReceiver,serve]
    }
    return serve
}
export class DumpChannel{
    serverSideReceiver:MessageReceiver|null=null
    clientSideReceiver:MessageReceiver|null=null
    serverSideClient:Client|null=null
    clientSideClient:Client|null=null
    
    setServerSide(messageReceiver:MessageReceiver,client:Client) {
        this.serverSideReceiver=messageReceiver
        this.serverSideClient=client
    }
    setClientSide(messageReceiver:MessageReceiver,client:Client) {
        this.clientSideReceiver=messageReceiver
        this.clientSideClient=client
    }
    sendToServer(message:Uint8Array){
        this.serverSideReceiver!.onReceiveMessage(decode(message),this.serverSideClient as Client)
    }
    sendToClient(message:Uint8Array){
        this.clientSideReceiver!.onReceiveMessage(decode(message),this.clientSideClient as Client)
    }
}
export async function createMain(hostId:string,channel:DumpChannel){
    let client=new Client(hostId)
    let messageReceiver=new MessageReceiver(hostId)
    channel.setClientSide(messageReceiver,client)
    const sender=new LocalSerializationSender(channel,'toServer')
    client.setSender(()=>sender)
    let main:any=await client.getMain()
    return [client,main]
    
}