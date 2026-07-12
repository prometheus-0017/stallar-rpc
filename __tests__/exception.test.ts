import { mainFunc, assert } from "./base";

describe('exception', () => {
    it('should propagate server exception to client', async () => {
        await mainFunc({
            add(a: number, b: number) {
                throw new Error('testException')
                return a + b
            }
        }, async (_client, mainAny: any) => {
            interface Main {
                add(a: number, b: number): Promise<number>
            }
            let main = mainAny as Main
            let flag = false
            try {
                let v = await main.add(1, 2)
            } catch (e) {
                flag = true
            }
            assert(flag, 'exception should have been caught')
        })
    })
})
