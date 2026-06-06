import { MessageReceiver,Client,Message,ISender } from "../src/rpc";
import { assert, mainFunc } from "./base";
mainFunc({
    add(a:number,b:number){
        //error nessary?
        throw new Error('testException')
        return a+b
    }

},async (_client,mainAny:any)=>{
    interface Main{
        add(a:number,b:number):Promise<number>
    }
    let main=mainAny as Main
    let flag=false
    try{
        let v=await main.add(1,2)
    }catch(e){
        // console.log(e)
        flag=true
    }
    assert(flag,'')
})



