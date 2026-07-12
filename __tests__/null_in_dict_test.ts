import { mainFunc, assert } from "./base";

describe('null in dict', () => {
    it('should handle null values inside dictionaries', async () => {
        await mainFunc({
            checkNull(pack: { a: number; b: number | null; c: string | null }) {
                assert(pack.b === null, 'b should be null')
                assert(pack.c === null, 'c should be null')
                return pack.a + 1
            }
        }, async (_client, mainAny: any) => {
            interface Main {
                checkNull(pack: { a: number; b: number | null; c: string | null }): Promise<number>
            }
            let main = mainAny as Main
            let v = await main.checkNull({ a: 1, b: null, c: null })
            assert(v === 2, 'result should be 2')
        })
    })

    it('should handle mixed null and non-null values in dict', async () => {
        await mainFunc({
            mixedNull(pack: { x: number; y: null; z: number }) {
                assert(pack.x === 10, 'x should be 10')
                assert(pack.y === null, 'y should be null')
                assert(pack.z === 30, 'z should be 30')
                return pack.x + pack.z
            }
        }, async (_client, mainAny: any) => {
            interface Main {
                mixedNull(pack: { x: number; y: null; z: number }): Promise<number>
            }
            let main = mainAny as Main
            let v = await main.mixedNull({ x: 10, y: null, z: 30 })
            assert(v === 40, 'result should be 40')
        })
    })
})
