import { mainFunc, assert } from "./base";

class NumberObject {
    value = 0;
    constructor(data: number) {
        this.value = data
    }
    async increase() {
        ++this.value
    }
    async getValue() {
        return this.value
    }
}

interface DataPack {
    a: NumberObject
    b: NumberObject
    c: NumberObject
}

describe('obj in dict', () => {
    it('should proxy objects inside dictionaries', async () => {
        await mainFunc({
            async add(pack: DataPack) {
                await pack.a.increase()
                await pack.c.increase()
                await pack.b.increase()
                return (await pack.a.getValue()) + (await pack.b.getValue())
            }
        }, async (_client, mainAny: any) => {
            interface Main {
                add(pack: DataPack): Promise<number>
            }
            let main = mainAny as Main
            let a = new NumberObject(0)
            let pack: DataPack = {
                a: a,
                b: new NumberObject(0),
                c: a
            }
            let v = await main.add(pack)
            assert(v === 3, 'obj in dict false')
        })
    })
})
