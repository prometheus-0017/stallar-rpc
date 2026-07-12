import { mainFunc, assert } from "./base";

describe('null argument', () => {
    it('should pass null as argument and verify it arrives as null', async () => {
        await mainFunc({
            add(a: number, b: number, callback: any) {
                assert(callback === null, 'callback should be null')
                return a + b
            }
        }, async (_client, mainAny: any) => {
            interface Main {
                add(a: number, b: number, callback: any): Promise<number>
            }
            let main = mainAny as Main
            let v = await main.add(1, 2, null)
            assert(v === 3, 'result should be 3')
        })
    })
})
