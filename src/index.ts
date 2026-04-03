export { setDebugFlag,PreArgObj,type Message,type Response,type Request,type MessageReceiverOptions,ObjectOfProxyManager as PlainProxyManager,RemoteProxyManager as RunnableProxyManager,MessageReceiver,Client,asProxy,getMessageReceiver,setHostId,type ISender } from './rpc.js'
export { WebSocketConnectionKeeper,WebSocketSender } from './WebsocketSender.js'

export interface Server{
    serve:()=>Server
}