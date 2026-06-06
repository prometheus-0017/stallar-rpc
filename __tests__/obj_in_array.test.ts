import { MessageReceiver,Client,Message,ISender } from "../src/rpc";
import { assert,mainFunc } from "./base";
class NumberObject{
    value=0;
    constructor(data:number){
        this.value=data
    }
    async increase(){
         ++this.value
    }
    async getValue(){
        return this.value
    }
}
mainFunc({
    async add(pack:Array<NumberObject>){
        let [a,b,c]=pack
        await a.increase()
        await c.increase()
        await b.increase()
        return (await a.getValue())+(await b.getValue())
    }
},async (_client,mainAny:any)=>{
    interface Main{
        add(pack:Array<NumberObject>):Promise<number>
    }
    let main=mainAny as Main
    let a=new NumberObject(0)
    let v=await main.add([a,new NumberObject(0),a])
    assert(v==3,'obj in array false')
})



