import { type MessageReceiverOptions,RunnableProxyManager,PlainProxyManager,setHostId,Client,ISender,asProxy,getMessageReceiver,MessageReceiver } from '../src/index'

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
    messageReceiverBackend.setObject('contextTest',{
        hello(context){
            return `hello ${context.a} and ${context.b}`
        }
    },true)
    messageReceiverBackend.setResultAutoWrapper(x=>x)
    messageReceiverBackend.addInterceptor(async (ctx,msg,clt,next)=>{
        ctx.a='mike'
        await next()
        delete ctx.a
    })
    messageReceiverBackend.addInterceptor(async(ctx,msg,clt,next)=>{
        ctx.b='jack'
        await next()
        delete ctx.b
    })

    let client=new Client()
    let ClientOnBackend=new Client(hostId)
    let sender=new DirectSender(ClientOnBackend,messageReceiverBackend)
    let backSender=new DirectSender(client,getMessageReceiver())
    client.sender=sender
    ClientOnBackend.sender=backSender
    client.setArgsAutoWrapper(x=>x);
    let rpc=await client.getObject('contextTest') as any
    let result=await rpc.hello()
    expect(result).toBe('hello mike and jack')
}
describe('funca', () => {
  it('should return the correct string', async() => {
    await main()
  });
});
// main()