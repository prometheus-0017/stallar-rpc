import { MessageReceiver,Client,Message,ISender } from "./rpc";
import {encode,decode} from 'cbor-x'
class LocalSerializationSender implements ISender{
    channel:DumpChannel;
    constructor(dumpChannel:DumpChannel){
        this.channel=dumpChannel
    }
    async send(message:Message){
        let dumped=encode(message)
        let message2=decode(dumped);
        this.channel.sendToServer(message2)
    }
}
export function createServer(hostId:string,channel:DumpChannel){
    let messageReceiver:MessageReceiver=new MessageReceiver(hostId)
    const serve=(mainObject:any)=>{
        messageReceiver.setMain(mainObject)
        return [messageReceiver,serve]
    }
    return serve
}
class DumpChannel{
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
export async function createMain(channel:DumpChannel){
    let client=new Client()
    let messageReceiver=new MessageReceiver()
    channel.setClientSide(messageReceiver,client)
    client.sender=new LocalSerializationSender(channel)
    let main=await client.getMain()
    return [client,main]
    
}