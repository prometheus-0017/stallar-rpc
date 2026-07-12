import { mainFunc } from "./base";

describe('base', () => {
    it('should add two numbers', async () => {
        await mainFunc({
            add(a: number, b: number) {
                return a + b
            }
        }, async (_client, mainAny: any) => {
            interface Main {
                add(a: number, b: number): Promise<number>
            }
            let main = mainAny as Main
            let v = await main.add(1, 2)
            expect(v).toBe(3)
        })
    })
})
