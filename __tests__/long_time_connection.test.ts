import { mainFunc, assert } from "./base";

function sleep(timeMillSec: number) {
    return new Promise(resolve => {
        setTimeout(resolve, timeMillSec)
    })
}

describe('long time connection', () => {
    it('should handle slow server method', async () => {
        await mainFunc({
            async slowAdd(a: number, b: number) {
                await sleep(300)
                return a + b
            }
        }, async (_client, mainAny: any) => {
            interface Main {
                slowAdd(a: number, b: number): Promise<number>
            }
            let main = mainAny as Main
            let v = await main.slowAdd(1, 2)
            assert(v === 3, 'long time connection result should be 3')
        })
    })

    it('should handle multiple sequential slow requests', async () => {
        await mainFunc({
            async slowDouble(n: number) {
                await sleep(200)
                return n * 2
            }
        }, async (_client, mainAny: any) => {
            interface Main {
                slowDouble(n: number): Promise<number>
            }
            let main = mainAny as Main
            let v1 = await main.slowDouble(3)
            let v2 = await main.slowDouble(v1)
            assert(v2 === 12, 'sequential slow requests failed')
        })
    })

    it('should handle concurrent slow requests', async () => {
        await mainFunc({
            async slowAdd(a: number, b: number) {
                await sleep(200)
                return a + b
            }
        }, async (_client, mainAny: any) => {
            interface Main {
                slowAdd(a: number, b: number): Promise<number>
            }
            let main = mainAny as Main
            let [v1, v2, v3] = await Promise.all([
                main.slowAdd(1, 2),
                main.slowAdd(3, 4),
                main.slowAdd(5, 6)
            ])
            assert(v1 === 3, 'concurrent request 1 failed')
            assert(v2 === 7, 'concurrent request 2 failed')
            assert(v3 === 11, 'concurrent request 3 failed')
        })
    })
})
