import { MessageReceiver,Client,Message,ISender } from "../src/rpc";
import { assert,mainFunc } from "./base";

// Utility functions for byte operations
function int2byte(value: number): Uint8Array {
    // Convert a 32-bit integer to a 4-byte array (big-endian)
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    view.setInt32(0, value, false); // false = big-endian
    return new Uint8Array(buffer);
}

function byteconcat(arr1: Uint8Array, arr2: Uint8Array): Uint8Array {
    // Concatenate two byte arrays into one
    const result = new Uint8Array(arr1.length + arr2.length);
    result.set(arr1, 0);
    result.set(arr2, arr1.length);
    return result;
}

function byte2int(bytes: Uint8Array,offset:number=0): number {
    // Convert a 4-byte array back to a 32-bit integer (big-endian)
    const buffer = bytes.buffer.slice(bytes.byteOffset+offset,offset+ bytes.byteOffset + 4);
    const view = new DataView(buffer);
    return view.getInt32(0, false); // false = big-endian
}

mainFunc({
    add(a:Uint8Array,b:Uint8Array){
        return byteconcat(a,b)
    }

},async (_client,mainAny:any)=>{
    interface Main{
        add(a:Uint8Array,b:Uint8Array):Promise<Uint8Array>
    }
    let main=mainAny as Main
    let v=await main.add(int2byte(1),int2byte(2))
    let a=byte2int(v)
    let b=byte2int(v,4)
    assert(a+b==3,'')
})


