import { MessageReceiver,Client,Message,ISender } from "../src/rpc";
import { mainFunc,assert } from "./base";
mainFunc({
    add(a:number,b:number,callback:any){
        callback(a+b)
        return a+b
    }

},async (_client,mainAny:any)=>{
    interface Main{
        add(a:number,b:number,c:any):Promise<number>
    }
    let main=mainAny as Main
    let v=await main.add(1,2,(val:number)=>assert(val==3))
})



