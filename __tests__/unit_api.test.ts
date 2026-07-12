import { PlainProxyManager, RunnableProxyManager, Client, PreArgObj, setHostId, getMessageReceiver, MessageReceiver } from '../src/index'
import { _deleteProxy, _deleteProxyById } from '../src/rpc'

describe('ObjectOfProxyManager (PlainProxyManager)', () => {
    it('should set and get object by id', () => {
        let manager = new PlainProxyManager()
        let obj = { name: 'test' }
        manager.set(obj, 'id1')
        expect(manager.getById('id1')).toBe(obj)
        expect(manager.get(obj)).toBe('id1')
        expect(manager.has(obj)).toBe(true)
    })

    it('should delete object by reference', () => {
        let manager = new PlainProxyManager()
        let obj = { name: 'test' }
        manager.set(obj, 'id2')
        expect(manager.has(obj)).toBe(true)
        manager.delete(obj)
        expect(manager.has(obj)).toBe(false)
        expect(manager.getById('id2')).toBeUndefined()
    })

    it('should delete object by id', () => {
        let manager = new PlainProxyManager()
        let obj = { name: 'test' }
        manager.set(obj, 'id3')
        manager.deleteById('id3')
        expect(manager.has(obj)).toBe(false)
        expect(manager.getById('id3')).toBeUndefined()
    })

    it('should handle multiple objects', () => {
        let manager = new PlainProxyManager()
        let obj1 = { name: 'a' }
        let obj2 = { name: 'b' }
        manager.set(obj1, 'id1')
        manager.set(obj2, 'id2')
        expect(manager.get(obj1)).toBe('id1')
        expect(manager.get(obj2)).toBe('id2')
        expect(manager.getById('id1')).toBe(obj1)
        expect(manager.getById('id2')).toBe(obj2)
    })

    it('should overwrite with same id', () => {
        let manager = new PlainProxyManager()
        let obj1 = { name: 'a' }
        let obj2 = { name: 'b' }
        manager.set(obj1, 'id1')
        manager.set(obj2, 'id1')
        expect(manager.getById('id1')).toBe(obj2)
    })

    it('should reRegister and update lastRegistered', () => {
        let manager = new PlainProxyManager()
        let obj = { name: 'test' }
        manager.set(obj, 'id1')
        let before = (manager as any).reverseProxyMap.get('id1').lastRegistered
        // Wait a tiny bit
        manager.reRegister('id1')
        let after = (manager as any).reverseProxyMap.get('id1').lastRegistered
        expect(after).toBeGreaterThanOrEqual(before)
    })
})

describe('RemoteProxyManager (RunnableProxyManager)', () => {
    it('should set and get proxy', () => {
        let manager = new RunnableProxyManager()
        let proxy = { method: () => { } }
        let client = new Client()
        manager.set('id1', proxy, client)
        expect(manager.get('id1')).toBe(proxy)
    })

    it('should return null for non-existent id', () => {
        let manager = new RunnableProxyManager()
        expect(manager.get('nonExistent')).toBeNull()
    })

    it('should track client to proxy id mapping', () => {
        let manager = new RunnableProxyManager()
        let proxy = { method: () => { } }
        let client = new Client()
        manager.set('id1', proxy, client)
        expect(manager.clientMap.has(client)).toBe(true)
        expect(manager.clientMap.get(client)?.has('id1')).toBe(true)
    })

    it('should handle multiple proxies for same client', () => {
        let manager = new RunnableProxyManager()
        let proxy1 = { method1: () => { } }
        let proxy2 = { method2: () => { } }
        let client = new Client()
        manager.set('id1', proxy1, client)
        manager.set('id2', proxy2, client)
        expect(manager.clientMap.get(client)?.size).toBe(2)
    })
})

describe('PreArgObj', () => {
    it('should create proxy type PreArgObj', () => {
        let obj = new PreArgObj('proxy', { id: 'test', hostId: 'h1', members: [] })
        expect(obj.type).toBe('proxy')
        expect(obj.data).toEqual({ id: 'test', hostId: 'h1', members: [] })
    })

    it('should create data type PreArgObj', () => {
        let obj = new PreArgObj('data', { value: 42 })
        expect(obj.type).toBe('data')
        expect(obj.data).toEqual({ value: 42 })
    })

    it('should create null type PreArgObj', () => {
        let obj = new PreArgObj(null, null)
        expect(obj.type).toBeNull()
        expect(obj.data).toBeNull()
    })
})

describe('Client', () => {
    it('should get hostId from option when not set', () => {
        setHostId('unitTestHost')
        let client = new Client()
        expect(client.getHostId()).toBe('unitTestHost')
    })

    it('should use its own hostId when set', () => {
        let client = new Client('customHost')
        expect(client.getHostId()).toBe('customHost')
    })
})

describe('MessageReceiver', () => {
    it('should track currentWaitingCount', () => {
        setHostId('waitingCountTest')
        let receiver = new MessageReceiver('waitingCountTest')
        expect(receiver.currentWaitingCount()).toBe(0)
    })

    it('should set and get main object', () => {
        setHostId('setMainTest')
        let receiver = new MessageReceiver('setMainTest')
        receiver.setMain({ hello: () => 'world' })
        let proxyManager = receiver.getProxyManager()
        let mainObj = proxyManager.getById('main')
        expect(mainObj).toBeDefined()
        expect(mainObj.hello()).toBe('world')
    })

    it('should setObject with context flag', () => {
        setHostId('setObjWithCtx')
        let receiver = new MessageReceiver('setObjWithCtx')
        receiver.setObject('myObj', { doStuff: () => 42 }, true)
        let proxyManager = receiver.getProxyManager()
        expect(proxyManager.getById('myObj')).toBeDefined()
        expect((receiver as any).objectWithContext.has('myObj')).toBe(true)
    })

    it('should setObject without context flag', () => {
        setHostId('setObjNoCtx')
        let receiver = new MessageReceiver('setObjNoCtx')
        receiver.setObject('myObj2', { doStuff: () => 42 }, false)
        expect((receiver as any).objectWithContext.has('myObj2')).toBe(false)
    })

    it('should add interceptor', () => {
        setHostId('interceptorTest')
        let receiver = new MessageReceiver('interceptorTest')
        receiver.addInterceptor(async (ctx, msg, clt, next) => { await next() })
        expect(receiver.interceptors.length).toBe(1)
    })
})

describe('_deleteProxy and _deleteProxyById', () => {
    it('_deleteProxyById should remove proxy by id', () => {
        setHostId('delProxyByIdTest')
        let receiver = new MessageReceiver('delProxyByIdTest')
        let obj = { name: 'test' }
        receiver.getProxyManager().set(obj, 'delId1')
        expect(receiver.getProxyManager().getById('delId1')).toBe(obj)
        _deleteProxyById('delId1', 'delProxyByIdTest')
        expect(receiver.getProxyManager().getById('delId1')).toBeUndefined()
    })

    it('_deleteProxy should remove proxy by object reference', () => {
        setHostId('delProxyTest')
        let receiver = new MessageReceiver('delProxyTest')
        let obj = { name: 'test' }
        receiver.getProxyManager().set(obj, 'delId2')
        expect(receiver.getProxyManager().has(obj)).toBe(true)
        _deleteProxy(obj, 'delProxyTest')
        expect(receiver.getProxyManager().has(obj)).toBe(false)
    })
})
