type ArgObjType='proxy'|'data'|null
export class PreArgObj{
    constructor(type:ArgObjType,data:any){
        this.type=type
        this.data=data
    }

    type:ArgObjType
    data:any
}
let debugFlag=false
export function setDebugFlag(flag:boolean){
    debugFlag=flag
}
interface ArgObj{
    type:ArgObjType,
    data:any
}
interface PlainProxy{
    id:string,
    hostId:string,
    members:Array<{type:'function'|'property',name:string}>
}
let hostId:string|null=null
export function setHostId(id:string){
    hostId=id
    getOrCreateOption(null).hostId=id
}
export function _deleteProxyById(id:string,hostId?:string){
    getOrCreateOption(hostId).plainProxyManager.deleteById(id)
}
export function _deleteProxy(obj:object,hostId?:string){
    getOrCreateOption(hostId).plainProxyManager.delete(obj)
}
export interface Request{
    id:string,
    meta:Record<string,any>
    method:string,
    objectId:string,
    args:Array<ArgObj>

}
export interface Response{
    id:string,
    idFor:string,
    status:number,
    trace?:string,
    data?:ArgObj
}
interface RunnableProxy{

}
export class RunnableProxyManager{
    
    map:Map<string,WeakRef<RunnableProxy>>
    constructor(){
        this.map=new Map<string,WeakRef<RunnableProxy>>()
    }
    set(id:string,proxy:RunnableProxy){
        this.map.set(id,new WeakRef(proxy))
    }
    get(id:string){
        if(!this.map.has(id)){
            return null
        }
        let result=this.map.get(id)?.deref()
        if(result==null){
            this.map.delete(id)
            return null
        }
        return result
    }
}
// let runnableProxyManager=new RunnableProxyManager()
export class PlainProxyManager{
    proxyMap:Map<any,string> = new Map<any,string>()
    reverseProxyMap:Map<string,any> = new Map<string,any>()
    set(obj:object,id:string){
        this.proxyMap.set(obj,id)
        this.reverseProxyMap.set(id,obj)
    }
    getById(id:string){
        return this.reverseProxyMap.get(id)
    }
    get(obj:object):string{
        return this.proxyMap.get(obj) as string
    }
    has(obj:object):boolean{
        return this.proxyMap.has(obj)
    }
    deleteById(id:string){ 
        let obj=this.reverseProxyMap.get(id)
        this.proxyMap.delete(obj)
        this.reverseProxyMap.delete(id)
    }
    delete(obj:object){ 
        this.reverseProxyMap.delete(this.proxyMap.get(obj) as string)
        this.proxyMap.delete(obj)
    }
}
// let proxyManager=new PlainProxyManager()
// function getGlobalHostId(){
//     return hostId
// }
// function getGlobalProxyManager(){
//     return proxyManager
// }
export function asProxy(obj:object,hostIdFrom?:string):PreArgObj{
    
    const proxyManager=getOrCreateOption(hostIdFrom).plainProxyManager
    const hostId=getOrCreateOption(hostIdFrom).hostId
    if(hostId==null){
        throw new Error("hostId is null")
    }

    if(! proxyManager.has(obj)){
        let id=getId()
        proxyManager.set(obj,id)
    }
    let id=proxyManager.get(obj) as string
    // if obj is a function
    let proxy=null
    if(typeof obj=='function'){
        proxy={
            id,
            hostId:hostId as string,
            members:[{type:'function',name:'__call__'}]
        }
    }else{
        if(obj==null){
            proxy=null
        }else{
            proxy = {
                id,
                hostId:hostId as string,
                members:Object
                    .keys(obj)
                    .filter(k=>((typeof (obj as Record<string,any>)[k])=='function'))
                    .filter(k=>!k.startsWith('__'))
                    .map(k=>({name:k,type:'function'}))}
        }
    }
    return new PreArgObj('proxy',proxy)
}
export function generateErrorReply(message:Request,errorText:string,status:number=500){
    let reply:Response={
        id:getId(),
        idFor:message.id,
        trace:errorText,
        status,
    }
    return reply
}
class NotImplementSender implements ISender{
    send(message: Request|Response): void {
        throw new Error('Not implement')
    }
}
function isRequest(obj:any):boolean{
    return obj.id!=null && obj.idFor==null
}
export class Client{
    sender:ISender=new NotImplementSender();
    hostId:string;
    argsAutoWrapper:AutoWrapper=shallowAutoWrapper
    setArgsAutoWrapper(autoWrapper:AutoWrapper){
        this.argsAutoWrapper=autoWrapper
    }

    constructor(hostId?:string|null){
        this.hostId=hostId as string
    }
    setSender(sender:ISender){
        if(this.sender!=null && (this.sender instanceof NotImplementSender)==false ){
            throw new Error('sender already set')
        }
        this.sender=sender
    }
    putAwait(id:string,resolve:any,reject:any){
        getOrCreateOption(this.hostId).requestPendingDict[id]={resolve,reject}
    }
    async waitForRequest(request:Request):Promise<{}>{
        if(debugFlag){
            assertRequest(request)
            assertArgJSON(request)
            console.log(`${this.getHostId()} is waiting for ${request.id},`,request)
        }
        const sender=this.sender
        return new Promise((resolve,reject)=>{
            if(sender==null){
                throw new Error('sender not set')
            }
            this.putAwait(request.id,resolve,reject)
            sender!.send(request)
        });

    }
    //preargobj仍然需要保留，浙江针对于可序列化对象的远程操作，那怎么区分到地方了以后的普通对象和代理对象？所有对象前面加个符号。
    //应当存在一种更广泛的设计考虑，而不是是在这里。走一步看一步。
    //我觉得你像使用本地对象一样使用远程对象这个事情在一开始就不是很现实。你必须得要包装一次别人做的对象，不然就可能出现别人用的是同步对象，但是远程对象都是异步的。而且还有一个问题是如果你对对象进行了一次包装，那。如果这个对象此前没有考虑这种远程调用的情况，中间产生的无数对象都要被包装成这种代理。这个成本很高。你需要一种顺序来确保集合的范围。我觉得这也不是什么大问题啊你再做一个同步版本不就完了？那***底层Thunder的是同步的然后应该有一个地方可以选是同步还是异步。
    toArgObj(obj:any):ArgObj{
        if(obj instanceof PreArgObj){
            return {type:obj.type,data:obj.data}
        }else {
            return {type:'data',data:obj}
        }
    }
    getHostId(){
        if(this.hostId==null){
            return getOrCreateOption(null).hostId
        }else{
            return this.hostId
        }
    }
    getProxyManager(){
        return getOrCreateOption(this.hostId).plainProxyManager
    }
    getRunnableProxyManager(){
        return getOrCreateOption(this.hostId).runnableProxyManager
    }
    reverseToArgObj(argObj:ArgObj):any{
        if(argObj.type=='data'){
            return argObj.data
        }else{
            let result:Record<string,any>={}
            let data:PlainProxy=argObj.data as PlainProxy

            if(data.hostId==this.hostId){
                return this.getProxyManager().getById(data.id)
            }

            let object=this.getRunnableProxyManager().get(data.id)
            if(object!=null){
                return object
            }
            for(let member of data.members){
                const key=member.type
                if(key=='property'){
                    console.warn('not implemented')
                }else if (key=='function'){
                    result[member.name]=async (...args:any[])=>{ 
                        let argsTransformed=args.map(x=>this.argsAutoWrapper(x)).map(arg=>{ 
                            return this.toArgObj(arg)
                        })
                        let request:Request={
                            objectId:data.id,
                            meta:{},
                            id:getId(),
                            method:member.name,
                            args:argsTransformed
                        }
                        let res:{};
                        res=await this.waitForRequest(request)
                        return res
                    }
                }else{
                    throw new Error('no such function')
                } 
            }
            if(result['__call__']){
                const func=async (...args:any[])=>{
                    return await result['__call__'](...args)
                }
                Object.assign(func,result)
                result=func
            }
            this.getRunnableProxyManager().set(data.id,result)
            return result
        }
    }
    async getObject(objectId:string){ 
        let request:Request={
            meta:{},
            id:getId(),
            objectId:'main0',
            method:'getMain',
            args:[this.toArgObj(objectId)]
        }
        let res:RunnableProxy= await this.waitForRequest(request) as Response
        return res;
    }
    async getMain(){
        return await this.getObject('main')
    }
}
let messageReceiver:MessageReceiver|null;
export type Message=Request|Response
export function getMessageReceiver():MessageReceiver{
    if(messageReceiver==null){
        messageReceiver=new MessageReceiver();
    }
    return messageReceiver;
}
type RpcContext=Record<string,any>
type NextGenerator=()=>NextFunction
type Interceptor=(context:RpcContext,message:Request,client:Client,nextGenerator:NextFunction)=>Promise<void>;
type NextFunction=()=>Promise<void>;
type AutoWrapper=(x:any)=>any
const shallowAutoWrapper:AutoWrapper=(obj)=>{
    if(obj==null){
        return obj
    }
    if(typeof obj=='function'){
        return asProxy(obj)
    }else if(Array.isArray(obj)){
        let notPureData=false
        for(let item of obj){
            if(typeof item=='function'){
                notPureData=true
                break
            }
        }
        if(notPureData){
            return asProxy(obj)
        }else{
            return obj
        }
    }else if(typeof obj=='object'){
        let notPureData=false
        for(let key of Object.keys(obj)){
            if(typeof obj[key]=='function'){
                notPureData=true
                break
            }
        }
        if(notPureData){
            return asProxy(obj)
        }else{
            return obj
        }
    }else{
        return obj
    }
}
export interface MessageReceiverOptions{
    plainProxyManager:PlainProxyManager
    runnableProxyManager:RunnableProxyManager
    hostId:string
    requestPendingDict:RequestPendingDict
}
let options:Record<string|symbol,MessageReceiverOptions>={}
let defaultHost=Symbol('defaultHost')
function getOrCreateOption(id?:string|null|symbol):MessageReceiverOptions{
    if(id==null){
        id=defaultHost
    }
    if(id===hostId){
        id=defaultHost
    }
    if(typeof id =='string' || id===defaultHost){

    }else{
        throw '你他妈传什么呢'
    }

    if(!options[id]){
        options[id]={
            plainProxyManager:new PlainProxyManager(),
            runnableProxyManager:new RunnableProxyManager(),
            hostId:(id===defaultHost?null:id )as string,
            requestPendingDict:{}
        }
    }
    return options[id]
}
type RequestPendingDict={
    [id:string]:{resolve:(result:any)=>void,reject:(error:any)=>void}
}
export class MessageReceiver{
    rpcServer?:Record<string,Function>
    interceptors:Interceptor[]=[]
    objectWithContext:Set<string>=new Set()
    resultAutoWrapper:AutoWrapper=shallowAutoWrapper
    setResultAutoWrapper(autoWrapper:AutoWrapper){
        this.resultAutoWrapper=autoWrapper
    }
    async withContext(message:Request,client:Client,args:any[],func:Function):Promise<any>{
        let constThis=this
        let result:any={}
        const context:RpcContext={
            setContext:(_result:Response)=>{
                result.value=_result
            }
        }
        function generateInteceptorExecutor(indexOfInteceptor:number):NextFunction{
            if(indexOfInteceptor<constThis.interceptors.length){
                async function executeThisInteceptor(){
                    let interceptor=await constThis.interceptors[indexOfInteceptor]
                    const generateAndExecuteNext=async()=>{
                        const executor:NextFunction=generateInteceptorExecutor(indexOfInteceptor+1)
                        await executor()
                    }
                    await interceptor(
                        context,
                        message,
                        client,
                        ()=>generateAndExecuteNext(),
                    )
                }
                return executeThisInteceptor
            }else{
                const executeThisInteceptor=async ()=>{
                    result.value=await func(context,...args)
                }
                return executeThisInteceptor
            }
        }
        let firstInteceptorExecetor=generateInteceptorExecutor(0)
        await firstInteceptorExecetor()
        return result.value
    }
    hostId?:string
    getProxyManager(){
        return getOrCreateOption(this.hostId).plainProxyManager
    }
    getRunnableProxyManager(){
        return getOrCreateOption(this.hostId).runnableProxyManager
    }
    getHostId(){
        return getOrCreateOption(this.hostId).hostId
    }
    getReqPending(){
        return getOrCreateOption(this.hostId).requestPendingDict
    }
    constructor(hostId?:string){
        this.hostId=hostId
        this.objectWithContext=new Set()
        let hostIdToSend=this.getHostId()
        this.getProxyManager().set({'getMain':(objectId:string)=>{
            if(objectId==null){
                objectId='main'
            }
            return asProxy(this.getProxyManager().getById(objectId),hostIdToSend)
        }},'main0')
    }
    setMain(obj:Record<string,Function>){
        this.rpcServer=obj
        this.setObject('main',this.rpcServer,false)
    }
    setObject(id:string,obj:Record<string,Function>,withContext:boolean){
        this.getProxyManager().set(obj,id)
        if(withContext){
            this.objectWithContext.add(id)
        }
    }
    addInterceptor(interceptor:Interceptor){
        this.interceptors.push(interceptor)
    }
    putAwait(id:string,resolve:any,reject:any){
        this.getReqPending()[id]={resolve,reject}
    }
    async onReceiveMessage(messageRecv:Request|Response,clientForCallBack:Client){
        if(clientForCallBack==null){
            throw new Error("clientForCallBack must not null")
        }
        if((clientForCallBack instanceof Client)==false){
            throw new Error("clientForCallBack must be a Client")
        }
        if(debugFlag){
            console.log(`${this.getHostId()} received a ${(messageRecv as Response).idFor?'reply, which is for '+messageRecv.id+' and it is '+(messageRecv as Response).idFor:'request,which id is '+messageRecv.id} `,messageRecv)
        }

        //is request, not reply
        if(!isResponse(messageRecv)){
            const message:Request=messageRecv as Request;
            let args=message.args.map(x=>clientForCallBack.reverseToArgObj(x))
            try{

                let object=this.getProxyManager().getById(message.objectId)
                if(object==null){
                    clientForCallBack.sender.send(generateErrorReply(message,'object not found',100))
                    return
                }
                
                let result=null
                const shouldWithContext=this.objectWithContext.has(message.objectId)
                if(message.method=='__call__'){
                    if(shouldWithContext){
                        result=await this.withContext(message,clientForCallBack,args,object)
                    }else{
                        result=object(...args)
                    }
                }else{
                    if(shouldWithContext){
                        result=await this.withContext(message,clientForCallBack,args,object[message.method])
                    }else{
                        result=object[message.method](...args)
                    }
                }
                result=this.resultAutoWrapper(result)
                result=await result
                let wrappedResult:ArgObj=clientForCallBack.toArgObj(result)
                if(debugFlag){
                    if(isSerializableDeep(wrappedResult)==false){
                        console.error(`${message.method}: result is not serializable`,object)
                        throw new Error(`${message.method}: result is not serializable`)
                    }
                }
                clientForCallBack.sender!.send({
                    id:getId(),
                    objectId:'',
                    method:'',
                    args:[],
                    idFor:message.id,
                    data:wrappedResult,
                    status:200
                })
            }catch(e){
                let exception=e as Error
                let trace=exception.stack
                let traceStr=trace?.split('\n').map(x=>x.trim()).join('\n')
                clientForCallBack.sender?.send({
                    id:getId(),
                    objectId:'',
                    method:'',
                    args:[],
                    idFor:message.id,
                    data:{type:'data',data:null},
                    trace:traceStr,
                    status:-1
                })
                console.error(e)

            }
            
        }else{
            let id_for=messageRecv.idFor;

            const message:Response=messageRecv as Response;
            const reqPending=this.getReqPending();
            if(reqPending[id_for]==undefined){
                console.warn(`[${this.getHostId()}] no pending request for id ${id_for}`,message)
                return
            }
            let req=reqPending[id_for];
            delete reqPending[id_for];
            if(message.status==200){
                req.resolve(clientForCallBack.reverseToArgObj(message.data as ArgObj))
            }else{
                req.reject(message);
            }
            
        }

    }

}
function isResponse(message:Request|Response):message is Response{
    return (message as Response).idFor!=undefined
}
export interface ISender{
    send(message:Request|Response):void
}


let idCOunt=0;
function getId(){
    return hostId+''+(idCOunt++)
}

// 校验工具函数

function isString(value: any): value is string {
  return typeof value === 'string';
}

function isObject(value: any): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isArray(value: any): value is any[] {
  return Array.isArray(value);
}

// 校验 ArgObjType 的合法值
function isValidArgObjType(type: any): type is 'proxy' | 'data' | null {
  return type === 'proxy' || type === 'data' || type === null;
}

// 校验 ArgObj
function assertArgObj(obj: any, path: string = 'argObj'): asserts obj is ArgObj {
  if (!isObject(obj)) {
    throw new Error(`${path}: expected object but got ${typeof obj}`);
  }

  if (!('type' in obj)) {
    throw new Error(`${path}.type: missing required field "type"`);
  }
  if (!isValidArgObjType(obj.type)) {
    throw new Error(`${path}.type: expected 'proxy' | 'data' | null, got ${JSON.stringify(obj.type)}`);
  }

  // `data` 字段可以是任意类型，无需校验
}
//应当自动转换成代理对象，不然的话不能做到一个类实际上调用的函数是一个本地对象和一个远程对象的时候，它的参数格式和类型是一致的。
//你应该考虑集合中的。深层次的代理对象的情况，不然的话，这个操作起来还是很麻烦的。
//如果你想要加代理对象的属性支持的话，那么在Java中还是get set。在JS中可以有set property在Python中。有get set吗？
// Host ID在设置的时候，初始化的时候得给一个随机值，不然如果是默认值的话，现在想要加这个。根据host ID找web socket，这样的话多连接容易会串。
//日期是一个非常糟糕的东西。 JSON里没有日期类型。啊，那你把它和普通类型和代理类型并列。
function isSerializableDeep(obj:any, seen = new WeakSet()) {
    // 处理 null (typeof null 是 "object", 需要单独处理)
    if (obj === null) {
        return true;
    }

    const type = typeof obj;

    // 基本类型检查
    if (type === "string" || type === "number" || type === "boolean" || type === "undefined") {
        // undefined 在对象属性中会被忽略，但作为根值时 stringify 会返回 undefined
        return true;
    }

    if (type === "bigint") {
        return false; // BigInt 无法被 JSON 序列化
    }

    if (type === "symbol") {
        return false; // Symbol 无法被 JSON 序列化
    }

    if (type === "function") {
        return false; // 函数无法被 JSON 序列化
    }

    // 如果是对象或数组
    if (type === "object") {
        if(Object.getPrototypeOf(obj)!==Object.prototype){
            return false;
        }
        // 检查循环引用
        if (seen.has(obj)) {
            return false;
        }
        seen.add(obj);

        // 检查数组
        if (Array.isArray(obj)) {
            for (let item of obj) {
                if (!isSerializableDeep(item, seen)) {
                    return false;
                }
            }
            return true;
        }

        // 检查普通对象
        for (let key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                // 检查键名 (JSON 键名必须是字符串)
                // (虽然 JavaScript 对象键名会自动转为字符串，但 Symbol 键需要排除)
                if (typeof key === "symbol") {
                    return false;
                }
                // 检查属性值
                if (!isSerializableDeep(obj[key], seen)) {
                    return false;
                }
            }
        }
        return true;
    }

    // 其他类型 (如 "object" 但不是 null、数组或普通对象，例如 Date)
    // 注意：Date 对象会被转换为字符串，所以是可序列化的
    return true;
}

// 测试用例
// console.log(isSerializableDeep({ a: 1, b: "hello" })); // true
// console.log(isSerializableDeep({ a: 1, b: undefined })); // false (因为 undefined 作为值被检测到)
// console.log(isSerializableDeep({ a: 1, b: function() {} })); // false
// console.log(isSerializableDeep({ a: 1, b: Symbol("test") })); // false
// console.log(isSerializableDeep(BigInt(123))); // false
// console.log(isSerializableDeep(new Date())); // true (Date 是可序列化的)
// console.log(isSerializableDeep(/regex/)); // false (正则表达式通常不被视为可 JSON 序列化，会被转为 {})
// 循环引用
// const obj = { a: 1 };
// obj.b = obj;
// console.log(isSerializableDeep(obj)); // false
function assertArgJSON(request:Request){
    for (let i = 0; i < request.args.length; i++) {
        let arg=request.args[i];
        let res=isSerializableDeep(arg,new WeakSet())
        if(!res){
            console.error(arg)
            throw new Error(`${request.method}.args[${i}] is not serializable`)
        }
    }
}
// 校验 Request
function assertRequest(request: any): asserts request is Request {
  if (!isObject(request)) {
    throw new Error(`request: expected object but got ${typeof request}`);
  }

  const { id, meta, method, objectId, args } = request;

  // 校验 id
  if (typeof id !== 'string') {
    throw new Error(`request.id: expected string, got ${typeof id}`);
  }

  // 校验 meta
  if (!isObject(meta)) {
    throw new Error(`request.meta: expected object, got ${typeof meta}`);
  }

  // 校验 method
  if (typeof method !== 'string') {
    throw new Error(`request.method: expected string, got ${typeof method}`);
  }

  // 校验 objectId
  if (typeof objectId !== 'string') {
    throw new Error(`request.objectId: expected string, got ${typeof objectId}`);
  }

  // 校验 args 数组
  if (!isArray(args)) {
    throw new Error(`request.args: expected array, got ${typeof args}`);
  }

  for (let i = 0; i < args.length; i++) {
    try {
      assertArgObj(args[i], `request.args[${i}]`);
    } catch (e) {
      throw e; // 直接抛出，保留路径信息
    }
  }
}

// 校验 Response
function assertResponse(response: any): asserts response is Response {
  if (!isObject(response)) {
    throw new Error(`response: expected object but got ${typeof response}`);
  }

  const { id, idFor, status, trace, data } = response;

  // 校验 id
  if (typeof id !== 'string') {
    throw new Error(`response.id: expected string, got ${typeof id}`);
  }

  // 校验 idFor
  if (typeof idFor !== 'string') {
    throw new Error(`response.idFor: expected string, got ${typeof idFor}`);
  }

  // 校验 status
  if (typeof status !== 'number') {
    throw new Error(`response.status: expected number, got ${typeof status}`);
  }

  // trace 是可选的，但如果存在必须是字符串
  if (trace !== undefined && typeof trace !== 'string') {
    throw new Error(`response.trace: if present, must be string, got ${typeof trace}`);
  }

  // data 是可选的 ArgObj
  if (data !== undefined) {
    try {
      assertArgObj(data, 'response.data');
    } catch (e) {
      throw e;
    }
  }
}
