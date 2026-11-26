import { supabase } from '../../../lib/supabase';
import { uploadToCloudinary } from '../../../shared/media/cloudinary';
import { classifyChatFile, validateChatText } from '../utils';

function client() {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase;
}

export async function getUid(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

export type Conversation = {
  id: string; kind: 'direct' | 'group'; title: string | null; created_by: string;
  updated_at: string; last_message_at?: string | null;
};
export type ChatMessage = {
  id: string; conversation_id: string; sender_id: string; body: string;
  message_type: 'text'|'game_invite'|'game_event'|'voice'|'image'|'video'|'document'|'system';
  metadata: Record<string, unknown>; attachment?: Record<string, unknown> | null;
  reply_to?: string | null; edited_at?: string | null; deleted_at?: string | null; created_at: string;
};
export type ChatGameSession = {
  id: string; conversation_id: string; game_id: string; room_id: string | null;
  match_id: string | null; status: string; invited_by: string;
};
export type ChatProfile = { id: string; username: string|null; display_name: string|null; avatar_url?: string|null };
export type ChatPreferences = {
  user_id: string; show_online: boolean; show_last_seen: boolean; read_receipts: boolean;
  allow_group_invites: boolean; allow_messages_from:'everyone'|'following'|'none'; notify_messages: boolean; notify_calls: boolean; message_preview: boolean;
};
export type ChatCall = {
  id: string; conversation_id: string; initiated_by: string; call_type: 'audio'|'video';
  status: 'ringing'|'accepted'|'ended'|'missed'|'declined'|'failed';
  started_at: string; answered_at: string|null; ended_at: string|null; created_at:string;
};

export async function listConversations(): Promise<Conversation[]> {
  const { data, error } = await client().from('chat_conversations').select('*')
    .order('last_message_at', { ascending: false, nullsFirst: false }).order('updated_at',{ascending:false});
  if (error) throw error;
  return (data ?? []) as Conversation[];
}
export async function openDirect(otherUserId: string): Promise<Conversation> {
  const { data, error } = await client().rpc('chat_get_or_create_direct', { p_other: otherUserId });
  if (error) throw error; return data as Conversation;
}
export async function createGroup(title: string, memberIds: string[]): Promise<Conversation> {
  const { data, error } = await client().rpc('chat_create_group', { p_title:title, p_member_ids:memberIds });
  if(error) throw error; return data as Conversation;
}
export async function listMessages(conversationId: string, limit = 100): Promise<ChatMessage[]> {
  const { data,error } = await client().from('chat_messages').select('*').eq('conversation_id',conversationId)
    .order('created_at',{ascending:true}).limit(Math.min(Math.max(limit,1),200));
  if(error) throw error; return (data??[]) as ChatMessage[];
}
export async function sendMessage(conversationId:string, body:string, type:'text'|'voice'|'image'|'video'|'document'='text',
  attachment?:Record<string,unknown>|null, replyTo?:string|null):Promise<ChatMessage>{
  const safeBody=type==='text'?validateChatText(body):body;
  const {data,error}=await client().rpc('chat_send_message',{
    p_conversation_id:conversationId,p_body:safeBody,p_type:type,p_reply_to:replyTo??null,
    p_attachment:attachment??null,p_client_nonce:crypto.randomUUID()
  });
  if(error) throw error; return data as ChatMessage;
}
export async function sendText(conversationId:string,body:string,replyTo?:string|null){return sendMessage(conversationId,body,'text',null,replyTo);}
export async function editMessage(id:string,body:string):Promise<void>{
  const {error}=await client().from('chat_messages').update({body}).eq('id',id); if(error) throw error;
}
export async function deleteMessage(id:string):Promise<void>{
  const {error}=await client().from('chat_messages').update({deleted_at:new Date().toISOString()}).eq('id',id); if(error) throw error;
}
export async function searchMessages(conversationId:string,q:string):Promise<ChatMessage[]>{
  const query=q.trim(); if(!query) return [];
  const {data,error}=await client().from('chat_messages').select('*').eq('conversation_id',conversationId)
    .is('deleted_at',null).ilike('body',`%${query.replace(/[%_,]/g,' ')}%`).order('created_at',{ascending:false}).limit(50);
  if(error) throw error; return (data??[]) as ChatMessage[];
}
export async function uploadChatFile(file:File):Promise<{secure_url:string;public_id:string;resource_type:string;bytes:number;format?:string}>{
  const mime=file.type.toLowerCase();
  const kind=classifyChatFile(file);
  const type:'image'|'video'|'raw'=mime.startsWith('audio/')?'video':kind==='image'?'image':kind==='video'?'video':'raw';
  const allowed=type==='image'?['image/jpeg','image/png','image/webp','image/gif']:
    type==='video'?['video/mp4','video/webm','video/quicktime','audio/webm','audio/ogg','audio/mp4']:
    ['application/pdf','text/plain','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
     'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
     'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation'];
  if(!allowed.includes(mime)) throw new Error('This file type is not supported.');
  const max=type==='video'?80*1024*1024: type==='image'?12*1024*1024:20*1024*1024;
  if(file.size<=0||file.size>max) throw new Error(`File is too large. Maximum size is ${Math.round(max/1024/1024)} MB.`);
  const result=await uploadToCloudinary(file,type,'chat');
  return result;
}
export async function sendAttachment(conversationId:string,file:File,kind?:'voice'):Promise<ChatMessage>{
  const uploaded=await uploadChatFile(file);
  const mime=file.type.toLowerCase();
  const type=kind??(mime.startsWith('image/')?'image':mime.startsWith('video/')?'video':'document');
  return sendMessage(conversationId,file.name,type,{
    url:uploaded.secure_url,public_id:uploaded.public_id,resource_type:uploaded.resource_type,
    bytes:uploaded.bytes,format:uploaded.format??null,mime_type:mime,file_name:file.name
  });
}
export async function sendGameInvite(conversationId:string,gameId:string):Promise<ChatGameSession>{
  const {data,error}=await client().rpc('chat_send_game_invite',{p_conversation_id:conversationId,p_game_id:gameId});
  if(error) throw error; return data as ChatGameSession;
}
export async function acceptGameInvite(sessionId:string):Promise<ChatGameSession>{
  const {data,error}=await client().rpc('chat_accept_game_invite',{p_session_id:sessionId});
  if(error) throw error; return data as ChatGameSession;
}
export async function declineGameInvite(sessionId:string):Promise<void>{
  const {error}=await client().rpc('chat_decline_game_invite',{p_session_id:sessionId}); if(error) throw error;
}
export async function getActiveSession(conversationId:string):Promise<ChatGameSession|null>{
  const {data,error}=await client().from('chat_game_sessions').select('*').eq('conversation_id',conversationId)
    .in('status',['invited','active']).order('created_at',{ascending:false}).limit(1).maybeSingle();
  if(error) throw error; return data as ChatGameSession|null;
}
export async function searchProfiles(q:string):Promise<ChatProfile[]>{
  const query=q.trim().replace(/[^a-zA-Z0-9_.\-\s]/g,' '); if(!query) return [];
  const {data,error}=await client().from('profiles').select('id,username,display_name,avatar_url')
    .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`).limit(15);
  if(error) throw error; return (data??[]) as ChatProfile[];
}
export async function listMembers(conversationId:string):Promise<ChatProfile[]>{
  const {data,error}=await client().from('chat_members').select('profile:profiles(id,username,display_name,avatar_url)')
    .eq('conversation_id',conversationId);
  if(error) throw error;
  return (data??[]).map((r:any)=>r.profile).filter(Boolean) as ChatProfile[];
}
export async function getPreferences():Promise<ChatPreferences|null>{
  const uid=await getUid(); if(!uid) return null;
  const {data,error}=await client().from('chat_preferences').select('*').eq('user_id',uid).maybeSingle();
  if(error) throw error; return data as ChatPreferences|null;
}
export async function savePreferences(patch:Partial<Omit<ChatPreferences,'user_id'>>):Promise<void>{
  const uid=await getUid(); if(!uid) throw new Error('Not authenticated');
  const {error}=await client().from('chat_preferences').upsert({user_id:uid,...patch,updated_at:new Date().toISOString()});
  if(error) throw error;
}
export async function setPresence(online:boolean):Promise<void>{
  const {error}=await client().rpc('chat_set_presence',{p_online:online}); if(error) throw error;
}
export async function getPresence(userIds:string[]){
  if(!userIds.length) return [];
  const {data,error}=await client().rpc('chat_get_presence',{p_user_ids:userIds});
  if(error) throw error; return data??[];
}
export async function markDelivered(messageIds:string[]):Promise<void>{
  if(!messageIds.length) return; const {error}=await client().rpc('chat_mark_delivered',{p_message_ids:messageIds}); if(error) throw error;
}
export async function markRead(conversationId:string):Promise<void>{
  const {error}=await client().rpc('chat_mark_read',{p_conversation_id:conversationId}); if(error) throw error;
}
export async function listReceipts(messageIds:string[]){
  if(!messageIds.length) return [];
  const {data,error}=await client().from('chat_message_receipts').select('*').in('message_id',messageIds);
  if(error) throw error; return data??[];
}
export async function startCall(conversationId:string,type:'audio'|'video'):Promise<ChatCall>{
  const {data,error}=await client().rpc('chat_start_call',{p_conversation_id:conversationId,p_call_type:type});
  if(error) throw error; return data as ChatCall;
}
export async function updateCall(callId:string,status:ChatCall['status']):Promise<ChatCall>{
  const {data,error}=await client().rpc('chat_update_call',{p_call_id:callId,p_status:status});
  if(error) throw error; return data as ChatCall;
}
export async function listCalls(conversationId:string):Promise<ChatCall[]>{
  const {data,error}=await client().from('chat_calls').select('*').eq('conversation_id',conversationId)
    .order('created_at',{ascending:false}).limit(50);
  if(error) throw error; return (data??[]) as ChatCall[];
}
export async function sendCallSignal(callId:string,recipientId:string,signal:Record<string,unknown>):Promise<void>{
  const uid=await getUid(); if(!uid) throw new Error('Not authenticated');
  const {error}=await client().from('chat_call_signals').insert({call_id:callId,sender_id:uid,recipient_id:recipientId,signal});
  if(error) throw error;
}
export function subscribeCallSignals(callId:string,onSignal:(signal:Record<string,unknown>)=>void,onReady?:()=>void):()=>void{
  const ch=client().channel(`call-signals:${callId}`).on('postgres_changes',
    {event:'INSERT',schema:'public',table:'chat_call_signals',filter:`call_id=eq.${callId}`},
    payload=>{const row=payload.new as any; void getUid().then(uid=>{if(row.recipient_id===uid) onSignal(row.signal as Record<string,unknown>);});}
  ).subscribe(status=>{if(status==='SUBSCRIBED'){
    void (async()=>{const uid=await getUid();if(uid){const {data}=await client().from('chat_call_signals').select('signal')
      .eq('call_id',callId).eq('recipient_id',uid).order('id',{ascending:true});
      (data??[]).forEach((row:any)=>onSignal(row.signal as Record<string,unknown>));}
      onReady?.();
    })();
  }});
  return ()=>{void client().removeChannel(ch);};
}
export function subscribeMessages(conversationId:string,onInsert:(msg:ChatMessage)=>void):()=>void{
  const ch=client().channel(`chat:${conversationId}`).on('postgres_changes',
    {event:'*',schema:'public',table:'chat_messages',filter:`conversation_id=eq.${conversationId}`},
    payload=>onInsert(payload.new as ChatMessage)).subscribe();
  return ()=>{void client().removeChannel(ch);};
}
export function subscribePresence(onChange:()=>void):()=>void{
  const ch=client().channel('chat-presence').on('postgres_changes',
    {event:'*',schema:'public',table:'chat_presence'},onChange).subscribe();
  return ()=>{void client().removeChannel(ch);};
}

export function subscribeCalls(conversationId:string,onChange:()=>void):()=>void{
  const ch=client().channel(`calls:${conversationId}`).on('postgres_changes',
    {event:'*',schema:'public',table:'chat_calls',filter:`conversation_id=eq.${conversationId}`},onChange).subscribe();
  return ()=>{void client().removeChannel(ch);};
}

const typingChannels = new Map<string, ReturnType<NonNullable<typeof supabase>['channel']>>();
export function subscribeTyping(conversationId:string,onTyping:()=>void):()=>void{
  const ch=client().channel(`chat-typing:${conversationId}`,{config:{private:true}});
  typingChannels.set(conversationId,ch);
  ch.on('broadcast',{event:'typing'},()=>onTyping()).subscribe();
  return ()=>{typingChannels.delete(conversationId);void client().removeChannel(ch);};
}
export function broadcastTyping(conversationId:string):void{
  const ch=typingChannels.get(conversationId);
  if(ch) void ch.send({type:'broadcast',event:'typing',payload:{at:Date.now()}});
}

export async function getCallIceServers():Promise<RTCIceServer[]>{
  const fallback:RTCIceServer[]=[{urls:'stun:stun.l.google.com:19302'}];
  const {data,error}=await client().functions.invoke('webrtc-ice-servers',{body:{}});
  if(error||!Array.isArray(data?.iceServers)) return fallback;
  return [...fallback,...data.iceServers as RTCIceServer[]];
}
