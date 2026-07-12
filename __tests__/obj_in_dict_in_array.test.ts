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

describe('obj in dict in array', () => {
    it('should handle proxy objects inside dicts which are inside arrays', async () => {
        await mainFunc({
            async process(items: Array<{ obj: NumberObject }>) {
                for (let item of items) {
                    await item.obj.increase()
                }
                return (await items[0].obj.getValue()) + (await items[1].obj.getValue())
            }
        }, async (_client, mainAny: any) => {
            interface Main {
                process(items: Array<{ obj: NumberObject }>): Promise<number>
            }
            let main = mainAny as Main
            let a = new NumberObject(1)
            let b = new NumberObject(2)
            let v = await main.process([{ obj: a }, { obj: b }])
            assert(v === 5, 'obj in dict in array failed')  // (1+1) + (2+1) = 5
        })
    })

    it('should handle same proxy object referenced in multiple dict entries in array', async () => {
        await mainFunc({
            async process(items: Array<{ obj: NumberObject }>) {
                await items[0].obj.increase()
                await items[1].obj.increase()
                return await items[0].obj.getValue()
            }
        }, async (_client, mainAny: any) => {
            interface Main {
                process(items: Array<{ obj: NumberObject }>): Promise<number>
            }
            let main = mainAny as Main
            let a = new NumberObject(0)
            let v = await main.process([{ obj: a }, { obj: a }])
            assert(v === 2, 'same obj in dict in array failed')  // same object increased twice
        })
    })
})
