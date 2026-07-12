import {createMain,createServer,DumpChannel} from '../src/localSerializationSender'
import {Client,MessageReceiver,setHostId} from '../src/rpc'

let _idCounter = 0

export async function mainFunc(mainObject:any,testProcess:(client:Client,main:any,serverId:string)=>Promise<void>,customHostIds?:{serverId?:string,clientId?:string}){
    let id = _idCounter++
    let serverId = customHostIds?.serverId || `server${id}`
    let clientId = customHostIds?.clientId || `client${id}`
    let channel=new DumpChannel()
    let server=await createServer(serverId,channel)
    let [recv,serve]=server(mainObject)
    let [_client,main0]=await createMain(clientId,channel)
    await testProcess(_client,main0,serverId)
}
export function assert(bool:boolean,text:string|null=null){
    if(!bool){
        throw new Error(text||'')
    }
}
