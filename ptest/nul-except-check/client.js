import { PlainProxyManager,RunnableProxyManager,MessageReceiver,Client,asProxy,getMessageReceiver,setHostId, setDebugFlag } from '../../src/index.js'
import {WebSocket} from 'ws'

//define a sender
class Sender {
  constructor(ws) {
    this.ws=ws
  }
  async send(message) {
    //message is an object can be jsonified
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
      console.log(`收到服务器消息: ${data}`);
    });
    client.setSender(new Sender(ws))
    

    let main=await client.getMain()
    let result=await main.plus(1,2,asProxy((result)=>console.log('from callback',result)))
    console.log('from rpc',result)
    try{
        result=await main.plus(1,2,null)
        throw new Error('should not reach here')
    }catch(e){
        console.log('right')
    }
    setDebugFlag(true)
    result=await main.plus(/a(.*?)/g,2,null)
}
main()