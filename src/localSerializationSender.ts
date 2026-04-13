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
export async function createServer(hostId:string,channel:DumpChannel){
    let messageReceiver:MessageReceiver=new MessageReceiver(hostId)
    let client=new Client(hostId)
    client.setSender(new LocalSerializationSender(channel,'toClient'))
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
    client.sender=new LocalSerializationSender(channel,'toServer')
    let main:any=await client.getMain()
    return [client,main]
    
}