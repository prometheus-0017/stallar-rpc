import { MessageReceiver,Client,Message,ISender } from "../src/rpc";
import { assert,mainFunc } from "./base";
mainFunc({
    add(a:number,b:number,callback:any){
        assert(callback==null,'')
        return a+b
    }

},async (_client,mainAny:any)=>{
    interface Main{
        add(a:number,b:number,callback:any):Promise<number>
    }
    let main=mainAny as Main
    let v=await main.add(1,2,null)
    assert(v==3,'')
})



