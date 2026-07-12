import { mainFunc, assert } from "./base";

describe('return types', () => {
    it('should return string', async () => {
        await mainFunc({
            greet(name: string) {
                return `hello ${name}`
            }
        }, async (_client, mainAny: any) => {
            interface Main { greet(name: string): Promise<string> }
            let main = mainAny as Main
            let v = await main.greet('world')
            assert(v === 'hello world', 'string return failed')
        })
    })

    it('should return boolean', async () => {
        await mainFunc({
            isPositive(n: number) {
                return n > 0
            }
        }, async (_client, mainAny: any) => {
            interface Main { isPositive(n: number): Promise<boolean> }
            let main = mainAny as Main
            let v1 = await main.isPositive(5)
            let v2 = await main.isPositive(-1)
            assert(v1 === true, 'boolean true return failed')
            assert(v2 === false, 'boolean false return failed')
        })
    })

    it('should return plain dict', async () => {
        await mainFunc({
            getData() {
                return { a: 1, b: 'hello', c: true }
            }
        }, async (_client, mainAny: any) => {
            interface Main { getData(): Promise<{ a: number; b: string; c: boolean }> }
            let main = mainAny as Main
            let v = await main.getData()
            assert(v.a === 1, 'dict.a return failed')
            assert(v.b === 'hello', 'dict.b return failed')
            assert(v.c === true, 'dict.c return failed')
        })
    })

    it('should return null for void method (undefined becomes null via serialization)', async () => {
        await mainFunc({
            doNothing() {
                // no return = undefined
            }
        }, async (_client, mainAny: any) => {
            interface Main { doNothing(): Promise<void> }
            let main = mainAny as Main
            let v = await main.doNothing()
            // undefined is serialized as null through toArgObj
            assert(v === null, 'void return should be null after serialization')
        })
    })

    it('should return number', async () => {
        await mainFunc({
            double(n: number) {
                return n * 2
            }
        }, async (_client, mainAny: any) => {
            interface Main { double(n: number): Promise<number> }
            let main = mainAny as Main
            let v = await main.double(7)
            assert(v === 14, 'number return failed')
        })
    })

    it('should return zero', async () => {
        await mainFunc({
            zero() {
                return 0
            }
        }, async (_client, mainAny: any) => {
            interface Main { zero(): Promise<number> }
            let main = mainAny as Main
            let v = await main.zero()
            assert(v === 0, 'zero return failed')
        })
    })

    it('should return empty string', async () => {
        await mainFunc({
            emptyStr() {
                return ''
            }
        }, async (_client, mainAny: any) => {
            interface Main { emptyStr(): Promise<string> }
            let main = mainAny as Main
            let v = await main.emptyStr()
            assert(v === '', 'empty string return failed')
        })
    })

    it('should return nested dict', async () => {
        await mainFunc({
            getNested() {
                return { outer: { inner: 42 } }
            }
        }, async (_client, mainAny: any) => {
            interface Main { getNested(): Promise<{ outer: { inner: number } }> }
            let main = mainAny as Main
            let v = await main.getNested()
            assert(v.outer.inner === 42, 'nested dict return failed')
        })
    })

    it('should return array of primitives', async () => {
        await mainFunc({
            getList() {
                return [1, 'two', true]
            }
        }, async (_client, mainAny: any) => {
            interface Main { getList(): Promise<[number, string, boolean]> }
            let main = mainAny as Main
            let v = await main.getList()
            assert(v[0] === 1, 'array[0] return failed')
            assert(v[1] === 'two', 'array[1] return failed')
            assert(v[2] === true, 'array[2] return failed')
        })
    })
})
