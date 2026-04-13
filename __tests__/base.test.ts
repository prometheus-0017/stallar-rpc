import { MessageReceiver,Client,Message,ISender } from "../src/rpc";
import { mainFunc } from "./base";
mainFunc({
    add(a:number,b:number){
        return a+b
    }

},async (_client,mainAny:any)=>{
    interface Main{
        add(a:number,b:number):Promise<number>
    }
    let main=mainAny as Main
    let v=await main.add(1,2)
    console.log(v)
})



