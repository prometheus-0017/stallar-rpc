import {createMain,createServer,DumpChannel} from '../src/localSerializationSender'
import {Client,MessageReceiver,setHostId} from '../src/rpc'
export async function mainFunc(mainObject:any,testProcess:(client:Client,main:any)=>Promise<void>){
    let channel=new DumpChannel()
    let server=await createServer('server',channel)
    let [recv,serve]=server(mainObject)
    let [_client,main0]=await createMain('client',channel)
    await testProcess(_client,main0)
}