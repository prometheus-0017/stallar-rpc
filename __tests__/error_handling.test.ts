import { MessageReceiver, Client, ISender, generateErrorReply, setHostId, asProxy } from "../src/rpc";

class DirectSender implements ISender {
    clientCallback: Client
    msgReceiver: MessageReceiver
    constructor(clientCallback: Client, msgReceiverTo: MessageReceiver) {
        this.clientCallback = clientCallback
        this.msgReceiver = msgReceiverTo
    }
    async send(message: any) {
        this.msgReceiver.onReceiveMessage(message, this.clientCallback)
    }
}

describe('error handling', () => {
    it('should allow setSender to be called multiple times', () => {
        let client = new Client()
        client.setSender(() => ({ send: async () => { } } as any))
        client.setSender(() => ({ send: async () => { } } as any))
    })

    it('should throw when onReceiveMessage receives null client', async () => {
        let receiver = new MessageReceiver('errTestNull')
        await expect(receiver.onReceiveMessage({ id: 'test', idFor: undefined as any, meta: {}, status: 200 }, null as any))
            .rejects.toThrow('clientForCallBack must not null')
    })

    it('should throw when onReceiveMessage receives non-Client object', async () => {
        let receiver = new MessageReceiver('errTestNonClient')
        await expect(receiver.onReceiveMessage({ id: 'test', idFor: undefined as any, meta: {}, status: 200 }, {} as any))
            .rejects.toThrow('clientForCallBack must be a Client')
    })

    it('should return error response when object not found', async () => {
        const serverHostId = 'errNotFoundServer'
        const clientHostId = 'errNotFoundClient'
        setHostId(clientHostId)

        const messageReceiverBackend = new MessageReceiver(serverHostId)
        messageReceiverBackend.setMain({
            hello: () => 'world'
        })
        messageReceiverBackend.setResultAutoWrapper(x => x)

        let client = new Client(clientHostId)
        let clientOnBackend = new Client(serverHostId)
        let sender = new DirectSender(clientOnBackend, messageReceiverBackend)
        let backSender = new DirectSender(client, new MessageReceiver(clientHostId))
        client.setSender(()=>sender)
        clientOnBackend.setSender(()=>backSender)
        client.setArgsAutoWrapper(x => x)

        // Send request to a non-existent objectId
        let errorCaught = false
        try {
            await (client as any).waitForRequest({
                id: 'testReq1',
                objectId: 'nonExistentObj',
                method: 'someMethod',
                args: [],
                meta: {}
            })
        } catch (e: any) {
            errorCaught = true
            expect(e.status).toBe(100)
            expect(e.trace).toBe('object not found')
        }
        expect(errorCaught).toBe(true)
    })

    it('generateErrorReply should create proper error response', () => {
        let request = { id: 'req123', meta: {}, method: 'testMethod', objectId: 'obj1', args: [] }
        let reply = generateErrorReply(request, 'something went wrong', 500)
        expect(reply.idFor).toBe('req123')
        expect(reply.status).toBe(500)
        expect(reply.trace).toBe('something went wrong')
        expect(reply.meta).toBeDefined()
    })

    it('generateErrorReply should default to status 500', () => {
        let request = { id: 'req456', meta: {}, method: 'testMethod', objectId: 'obj1', args: [] }
        let reply = generateErrorReply(request, 'default error')
        expect(reply.status).toBe(500)
    })

    it('should propagate server exception to client with status -1', async () => {
        const serverHostId = 'errExceptionServer'
        const clientHostId = 'errExceptionClient'
        setHostId(clientHostId)

        const messageReceiverBackend = new MessageReceiver(serverHostId)
        messageReceiverBackend.setMain({
            throwErr() {
                throw new Error('server error')
            }
        })
        messageReceiverBackend.setResultAutoWrapper(x => x)

        let client = new Client(clientHostId)
        let clientOnBackend = new Client(serverHostId)
        let sender = new DirectSender(clientOnBackend, messageReceiverBackend)
        let backSender = new DirectSender(client, new MessageReceiver(clientHostId))
        client.setSender(()=>sender)
        clientOnBackend.setSender(()=>backSender)
        client.setArgsAutoWrapper(x => x)

        let rpc = await client.getMain() as any
        let errorCaught = false
        try {
            await rpc.throwErr()
        } catch (e: any) {
            errorCaught = true
            expect(e.status).toBe(-1)
            expect(e.trace).toContain('server error')
        }
        expect(errorCaught).toBe(true)
    })
})
