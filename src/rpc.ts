type ArgObjType='proxy'|'data'|null
class PreArgObj{
    constructor(type:ArgObjType,data:any){
        this.type=type
        this.data=data
    }

    type:ArgObjType
    data:any
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
// export interface Message{
//     id:string,
//     idFor?:string,
//     objectId:string,
//     method:string,
//     args:Array<ArgObj>,
//     status?:number,
//     trace?:string,
//     data?:ArgObj
// }
// type Not<T>={
//     [P in keyof T]:never
// }
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
        console.log(`${this.getHostId()} is waiting for ${id}`)
        getOrCreateOption(this.hostId).requestPendingDict[id]={resolve,reject}
    }
    async waitForRequest(request:Request):Promise<{}>{
        const sender=this.sender
        return new Promise((resolve,reject)=>{
            if(sender==null){
                throw new Error('sender not set')
            }
            this.putAwait(request.id,resolve,reject)
            sender!.send(request)
        });

    }
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
    onReceiveMessage(messageRecv:Request|Response,clientForCallBack:Client){
        // console.log(`${this.getHostId()} received a ${message.idFor?'reply, which is for '+message.id+' and it is '+message.idFor:'request,which id is '+message.id} `)
        let id_for=messageRecv.idFor;

        //is request, not reply
        if(id_for==null){
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
                        result=this.withContext(message,clientForCallBack,args,object)
                    }else{
                        result=object(...args)
                    }
                }else{
                    if(shouldWithContext){
                        result=this.withContext(message,clientForCallBack,args,object[message.method])
                    }else{
                        result=object[message.method](...args)
                    }
                }
                result=this.resultAutoWrapper(result)
                let wrappedResult:ArgObj=clientForCallBack.toArgObj(result)
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
            // if(this.rpcServer!=null){
            // }else{
            //     console.warn(`[${this.getHostId()}] no rpc specified but received a request`,message)
            // }
            
        }else{
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
export interface ISender{
    send(message:Request|Response):void
}


let idCOunt=0;
function getId(){
    return ''+(idCOunt++)
}