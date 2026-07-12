import { asProxy } from "../src/rpc";
import { mainFunc, assert } from "./base";

const FP_SERVER_ID = 'funcProxyServer'
const FP_CLIENT_ID = 'funcProxyClient'

describe('function proxy (__call__)', () => {
    it('should return a callable function object from server', async () => {
        await mainFunc({
            getMultiplier() {
                let fn = (a: number, b: number) => a * b
                return asProxy(fn, FP_SERVER_ID)
            }
        }, async (_client, mainAny: any) => {
            interface Main { getMultiplier(): Promise<any> }
            let main = mainAny as Main
            let multiplier = await main.getMultiplier()
            let result = await multiplier(3, 4)
            assert(result === 12, 'function proxy __call__ failed')
        }, { serverId: FP_SERVER_ID, clientId: FP_CLIENT_ID })
    })

    it('should return a callable function and call it multiple times', async () => {
        let callCount = 0
        await mainFunc({
            getCounter() {
                let fn = () => {
                    callCount++
                    return callCount
                }
                return asProxy(fn, FP_SERVER_ID + '2')
            }
        }, async (_client, mainAny: any) => {
            interface Main { getCounter(): Promise<any> }
            let main = mainAny as Main
            let counter = await main.getCounter()
            let v1 = await counter()
            let v2 = await counter()
            let v3 = await counter()
            assert(v1 === 1, 'counter first call failed')
            assert(v2 === 2, 'counter second call failed')
            assert(v3 === 3, 'counter third call failed')
        }, { serverId: FP_SERVER_ID + '2', clientId: FP_CLIENT_ID + '2' })
    })

    it('should handle callback argument via asProxy', async () => {
        await mainFunc({
            invokeCallback(cb: any, value: number) {
                return cb(value)
            }
        }, async (_client, mainAny: any) => {
            interface Main { invokeCallback(cb: any, value: number): Promise<number> }
            let main = mainAny as Main
            let result = await main.invokeCallback(asProxy((n: number) => n * 10, FP_CLIENT_ID + '3'), 5)
            assert(result === 50, 'callback via asProxy failed')
        }, { serverId: FP_SERVER_ID + '3', clientId: FP_CLIENT_ID + '3' })
    })
})
