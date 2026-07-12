import { asProxy, getProxyHoldingInfo, removeOutdatedProxyObject, autoReRegister } from "../src/rpc";
import { assert, mainFunc } from "./base";

const GC_SERVER_ID = 'gcServer'

function sleep(timeMillSec: number) {
    return new Promise(resolve => {
        setTimeout(resolve, timeMillSec)
    })
}

describe('gc', () => {
    it('should manage proxy lifecycle and garbage collection', async () => {
        await mainFunc({
            getObject() {
                let obj = {
                    add(a: number, b: number) {
                        return a + b
                    }
                }
                return asProxy(obj, GC_SERVER_ID)
            }
        }, async (_client, mainAny: any, serverId: string) => {
            interface Main {
                getObject(): Promise<any>
            }
            const serverInfo = () => (getProxyHoldingInfo().filter(x => x.hostId == serverId)[0])
            let main = mainAny as Main
            let count = serverInfo().count
            await removeOutdatedProxyObject(2000)
            assert(serverInfo().count === count, 'count should not change without new proxies')
            let v = await main.getObject()
            assert(count + 1 == serverInfo().count, 'count should increase by 1')
            await sleep(1000)
            let now = new Date()
            assert(-serverInfo().earliestDate.getTime() + now.getTime() >= 700, 'earliestDate should be at least 700ms ago')
            await autoReRegister();
            assert(now.getTime() - serverInfo().earliestDate.getTime() <= 200, 'earliestDate should be refreshed after reRegister')
            await sleep(500)
            count = serverInfo().count
            removeOutdatedProxyObject(50)
            assert(serverInfo().count < count, 'outdated proxies should be removed')
        }, { serverId: GC_SERVER_ID })
    })
})
