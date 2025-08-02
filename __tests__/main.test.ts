import { type MessageReceiverOptions,RunnableProxyManager,PlainProxyManager,setHostId,Client,ISender,asProxy,getMessageReceiver,MessageReceiver } from '../src/index'
import { _deleteProxy } from '../src/rpc';

async function main(){
    setHostId('frontJs');
    
    // const proxyManager=new PlainProxyManager()
    // const runnableProxyManager=new RunnableProxyManager()
    const hostId='backendJs'
    
    const messageReceiverBackend=new MessageReceiver(hostId)
    
    
    class DirectSender implements ISender{
        clientCallback:Client
        msgReceiver:MessageReceiver
        constructor(clientCallback:Client,msgReceiverTo:MessageReceiver){
            this.clientCallback=clientCallback
            this.msgReceiver=msgReceiverTo
        }
        async send(message:any){
            this.msgReceiver.onReceiveMessage(message,this.clientCallback)
            console.log('send',message)
        }
    }
    let objectTest={
        say(name){
            console.log('hello ',name)
        }
    }
    messageReceiverBackend.setMain({
        'hello':async (a:number,b:number,onResult:(a:number)=>Promise<any>)=>{
            await onResult(a+b)
            return a+b
        },
        'getObject':()=>{
            return asProxy(objectTest,hostId)
        }
    })
    messageReceiverBackend.setResultAutoWrapper(x=>x)

    let client=new Client()
    let ClientOnBackend=new Client(hostId)
    let sender=new DirectSender(ClientOnBackend,messageReceiverBackend)
    let backSender=new DirectSender(client,getMessageReceiver())
    client.sender=sender
    ClientOnBackend.sender=backSender
    client.setArgsAutoWrapper(x=>x);
    let rpc=await client.getMain() as any
    try{
        const callback=(a:number)=>expect(a).toBe(3)
        let result=await rpc.hello(1,2,asProxy(callback))
        _deleteProxy(callback)
        expect(result).toBe(3)
    }catch(e){
        console.error(e)
    }
    let remoteObject=await rpc.getObject()
    await remoteObject.say('world')
    // console.log(await rpc.hello(1,2,(a:number)=>console.log('callback',a)))
}
describe('funca', () => {
  it('should return the correct string', async() => {
    await main()
  });
});
// main()