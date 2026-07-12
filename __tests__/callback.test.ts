import { mainFunc, assert } from "./base";

describe('callback', () => {
    it('should invoke callback argument', async () => {
        await mainFunc({
            add(a: number, b: number, callback: any) {
                callback(a + b)
                return a + b
            }
        }, async (_client, mainAny: any) => {
            interface Main {
                add(a: number, b: number, c: any): Promise<number>
            }
            let main = mainAny as Main
            let v = await main.add(1, 2, (val: number) => assert(val === 3, 'callback value should be 3'))
            expect(v).toBe(3)
        })
    })
})
