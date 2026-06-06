import { MessageReceiver,Client,Message,ISender,asProxy,getProxyHoldingInfo,removeOutdatedProxyObject,autoReRegister } from "../src/rpc";
import { assert, mainFunc } from "./base";
async function sleep(timeMillSec:number){
    return new Promise(resolve=>{
        setTimeout(resolve,timeMillSec)
    })
}
mainFunc({
    getObject(){
        let obj={
            add(a:number,b:number){
                return a+b
            }
        }
        return asProxy(obj,'server')
    }
},async (_client,mainAny:any)=>{
    interface Main{
        getObject():Promise<any>
    }
    const serverInfo=()=>(getProxyHoldingInfo().filter(x=>x.hostId=='server')[0])
    let main=mainAny as Main
    let count=serverInfo().count
    await removeOutdatedProxyObject(2000)
    assert (serverInfo().count===count,'')
    let v=await main.getObject()
    assert(count+1==serverInfo().count,'')
    await sleep(1000)
    let now=new Date()
    assert (-serverInfo().earliestDate.getTime()+now.getTime()>=700,'')
    await autoReRegister();
    assert(now.getTime()-serverInfo().earliestDate.getTime()<=200,'')
    await sleep(500)
    count=serverInfo().count
    removeOutdatedProxyObject(50)
    assert(serverInfo().count<count,'')
})



