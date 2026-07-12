import { mainFunc, assert } from "./base";

function int2byte(value: number): Uint8Array {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    view.setInt32(0, value, false);
    return new Uint8Array(buffer);
}

function byteconcat(arr1: Uint8Array, arr2: Uint8Array): Uint8Array {
    const result = new Uint8Array(arr1.length + arr2.length);
    result.set(arr1, 0);
    result.set(arr2, arr1.length);
    return result;
}

function byte2int(bytes: Uint8Array, offset: number = 0): number {
    const buffer = bytes.buffer.slice(bytes.byteOffset + offset, offset + bytes.byteOffset + 4);
    const view = new DataView(buffer);
    return view.getInt32(0, false);
}

describe('byte', () => {
    it('should transmit Uint8Array and concatenate', async () => {
        await mainFunc({
            add(a: Uint8Array, b: Uint8Array) {
                return byteconcat(a, b)
            }
        }, async (_client, mainAny: any) => {
            interface Main {
                add(a: Uint8Array, b: Uint8Array): Promise<Uint8Array>
            }
            let main = mainAny as Main
            let v = await main.add(int2byte(1), int2byte(2))
            let a = byte2int(v)
            let b = byte2int(v, 4)
            assert(a + b === 3, 'byte concat failed')
        })
    })
})
