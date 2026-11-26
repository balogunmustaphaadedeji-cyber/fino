import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Gamepad2, MessageCircle, Search, Send, Paperclip, Mic, Square, Phone, Video,
  PhoneOff, Users, Pencil, Trash2, Reply, X, PhoneIncoming
} from 'lucide-react';
import {
  acceptGameInvite, declineGameInvite, getActiveSession, getUid, listConversations,
  listMessages, openDirect, searchProfiles, sendGameInvite, sendText, subscribeMessages,
  type ChatGameSession, type ChatMessage, type Conversation, sendAttachment, createGroup,
  editMessage, deleteMessage, searchMessages, listMembers, getPreferences, savePreferences,
  setPresence, getPresence, markDelivered, markRead, listReceipts, startCall, updateCall,
  listCalls, sendCallSignal, subscribeCallSignals, subscribeCalls, subscribePresence,
  subscribeTyping, broadcastTyping, getCallIceServers, type ChatCall, type ChatProfile, type ChatPreferences
} from './api/client';
import { GameInviteCard } from './components/GameInviteCard';
import { TicTacToeBoard } from '../games/components/TicTacToeBoard';
import { ChessBoard } from '../games/components/ChessBoard';
import { LudoBoard } from '../games/components/LudoBoard';
import { OnlineTicTacToe } from '../games/components/OnlineTicTacToe';
import { startRoomMatch, getRoomPlayers, completeMatch } from '../games/api/client';
import './chat.css';

const GAMES = [
  { id: 'tic-tac-toe', title: 'Tic-Tac-Toe' }, { id: 'chess', title: 'Chess' }, { id: 'ludo', title: 'Ludo' },
];


export default function ChatPage() {
  const [uid,setUid]=useState<string|null>(null);
  const [conversations,setConversations]=useState<Conversation[]>([]);
  const [active,setActive]=useState<Conversation|null>(null);
  const [messages,setMessages]=useState<ChatMessage[]>([]);
  const [text,setText]=useState('');
  const [showGames,setShowGames]=useState(false);
  const [session,setSession]=useState<ChatGameSession|null>(null);
  const [embeddedOpen,setEmbeddedOpen]=useState(false);
  const [matchId,setMatchId]=useState<string|null>(null);
  const [seat,setSeat]=useState(0);
  const [search,setSearch]=useState('');
  const [people,setPeople]=useState<ChatProfile[]>([]);
  const [error,setError]=useState<string|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [reply,setReply]=useState<ChatMessage|null>(null);
  const [editing,setEditing]=useState<ChatMessage|null>(null);
  const [messageSearch,setMessageSearch]=useState('');
  const [searchResults,setSearchResults]=useState<ChatMessage[]|null>(null);
  const [members,setMembers]=useState<ChatProfile[]>([]);
  const [presence,setPresenceState]=useState<Record<string,{is_online:boolean;last_seen_at:string}>>({});
  const [receipts,setReceipts]=useState<Record<string,{delivered_at:string|null;read_at:string|null}[]>>({});
  const [typing,setTyping]=useState(false);
  const [preferences,setPreferences]=useState<ChatPreferences|null>(null);
  const [calls,setCalls]=useState<ChatCall[]>([]);
  const [currentCall,setCurrentCall]=useState<ChatCall|null>(null);
  const [incomingCall,setIncomingCall]=useState<ChatCall|null>(null);
  const [callState,setCallState]=useState('');
  const [recording,setRecording]=useState(false);
  const [groupMode,setGroupMode]=useState(false);
  const [groupTitle,setGroupTitle]=useState('');
  const [groupMembers,setGroupMembers]=useState<string[]>([]);
  const [groupSearch,setGroupSearch]=useState('');
  const [searchParams]=useSearchParams();
  const deepLinkHandled=useRef(false);
  const fileRef=useRef<HTMLInputElement>(null);
  const recorderRef=useRef<MediaRecorder|null>(null);
  const chunksRef=useRef<Blob[]>([]);
  const pcRef=useRef<RTCPeerConnection|null>(null);
  const streamRef=useRef<MediaStream|null>(null);
  const remoteVideoRef=useRef<HTMLVideoElement>(null);
  const localVideoRef=useRef<HTMLVideoElement>(null);
  const remoteIdRef=useRef<string|null>(null);
  const activeCallRef=useRef<ChatCall|null>(null);
  const pendingIceRef=useRef<RTCIceCandidateInit[]>([]);
  const typingTimerRef=useRef<ReturnType<typeof setTimeout>|null>(null);
  const messagesRef=useRef<ChatMessage[]>(messages);

  useEffect(()=>{messagesRef.current=messages;},[messages]);

  useEffect(()=>{
    let alive=true;
    (async()=>{
      try{
        const id=await getUid(); if(!alive)return; setUid(id);
        if(id){
          const [convs,prefs]=await Promise.all([listConversations(),getPreferences()]);
          if(!alive)return; setConversations(convs); setPreferences(prefs);
          if(!prefs){await savePreferences({});setPreferences(await getPreferences());}
          await setPresence(true);
        }
      }catch(e){if(alive)setError(e instanceof Error?e.message:'Could not load chat');}
      finally{if(alive)setLoading(false);}
    })();
    const heartbeat=window.setInterval(()=>{if(document.visibilityState==='visible')void setPresence(true);},60000);
    const onVisible=()=>{if(document.visibilityState==='visible')void setPresence(true);};
    document.addEventListener('visibilitychange',onVisible);
    const onUnload=()=>{void setPresence(false);}; window.addEventListener('beforeunload',onUnload);
    return()=>{alive=false;window.clearInterval(heartbeat);document.removeEventListener('visibilitychange',onVisible);window.removeEventListener('beforeunload',onUnload);void setPresence(false);};
  },[]);

  const loadThread=useCallback(async(conv:Conversation)=>{
    setActive(conv);setError(null);setSearchResults(null);setReply(null);setEditing(null);
    try{
      const [msgs,sess,mem,callRows]=await Promise.all([listMessages(conv.id),getActiveSession(conv.id),listMembers(conv.id),listCalls(conv.id)]);
      setMessages(msgs);setSession(sess);setMembers(mem);setCalls(callRows);
      const other=mem.filter(m=>m.id!==uid).map(m=>m.id);
      const [presenceRows,receiptRows]=await Promise.all([getPresence(other),listReceipts(msgs.map(m=>m.id))]);
      setPresenceState(Object.fromEntries(presenceRows.map((p:any)=>[p.user_id,{is_online:p.is_online,last_seen_at:p.last_seen_at}])));
      setReceipts(receiptRows.reduce((acc:any,r:any)=>{(acc[r.message_id]??=[]).push({delivered_at:r.delivered_at,read_at:r.read_at});return acc;},{}));
      await markDelivered(msgs.filter(m=>m.sender_id!==uid).map(m=>m.id));
      await markRead(conv.id);
    }catch(e){setError(e instanceof Error?e.message:'Failed to load chat');}
  },[uid]);

  useEffect(()=>{
    if(!active)return;
    const unsubscribe=subscribeMessages(active.id,(msg)=>{
      setMessages(prev=>{const index=prev.findIndex(m=>m.id===msg.id);return index<0?[...prev,msg]:prev.map(m=>m.id===msg.id?msg:m);});
      if(msg.sender_id!==uid){void markDelivered([msg.id]);void markRead(active.id);
        if(preferences?.notify_messages && document.hidden && 'Notification' in window && Notification.permission==='granted')
          new Notification('FINO message',{body:preferences.message_preview?msg.body:'You received a message'});
      }
    });
    const unsubCalls=subscribeCalls(active.id,()=>{void listCalls(active.id).then(rows=>{
      setCalls(rows);const ringing=rows.find(c=>c.status==='ringing'&&c.initiated_by!==uid);
      setIncomingCall(ringing??null);
      const live=rows.find(c=>c.id===currentCall?.id);
      if(live&&['ended','missed','declined','failed'].includes(live.status)){signalUnsubRef.current?.();signalUnsubRef.current=null;closePeer();}
      if(ringing&&preferences?.notify_calls&&document.hidden&&'Notification' in window&&Notification.permission==='granted')
        new Notification('Incoming FINO call',{body:`Incoming ${ringing.call_type} call`});
    });});
    const unsubTyping=subscribeTyping(active.id,()=>{setTyping(true);if(typingTimerRef.current)clearTimeout(typingTimerRef.current);typingTimerRef.current=setTimeout(()=>setTyping(false),1800);});
    const refreshPresence=()=>void getPresence(members.filter(m=>m.id!==uid).map(m=>m.id)).then(rows=>
      setPresenceState(Object.fromEntries(rows.map((p:any)=>[p.user_id,{is_online:p.is_online,last_seen_at:p.last_seen_at}]))));
    const unsubPresence=subscribePresence(refreshPresence);
    const presencePoll=window.setInterval(()=>{refreshPresence();void listReceipts(messagesRef.current.map(m=>m.id)).then(rows=>
      setReceipts(rows.reduce((acc:any,r:any)=>{(acc[r.message_id]??=[]).push({delivered_at:r.delivered_at,read_at:r.read_at});return acc;},{})));},15000);
    void listCalls(active.id).then(rows=>{setCalls(rows);setIncomingCall(rows.find(c=>c.status==='ringing'&&c.initiated_by!==uid)??null);});
    return()=>{unsubscribe();unsubCalls();unsubPresence();unsubTyping();window.clearInterval(presencePoll);};
  },[active,uid,preferences,members,currentCall]);

  useEffect(()=>{
    if(!search.trim()){setPeople([]);return;}
    const timer=setTimeout(()=>void searchProfiles(search).then(setPeople).catch(()=>setPeople([])),300);
    return()=>clearTimeout(timer);
  },[search]);
  useEffect(()=>{
    if(!active||!messageSearch.trim()){setSearchResults(null);return;}
    const timer=setTimeout(()=>void searchMessages(active.id,messageSearch).then(setSearchResults).catch(e=>setError(e.message)),300);
    return()=>clearTimeout(timer);
  },[messageSearch,active]);

  // Open conversation when navigated from Learn: /chat?c=<conversation_id>
  useEffect(()=>{
    if (deepLinkHandled.current || loading || !uid) return;
    const cid = searchParams.get('c');
    if (!cid) return;
    deepLinkHandled.current = true;
    void (async () => {
      try {
        let list = conversations;
        if (!list.length) list = await listConversations();
        const found = list.find(c => c.id === cid);
        if (found) {
          setConversations(prev => prev.some(c => c.id === found.id) ? prev : [found, ...prev]);
          await loadThread(found);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not open linked conversation');
      }
    })();
  }, [loading, uid, searchParams, conversations, loadThread]);

  async function startDirect(userId:string){
    try{const conv=await openDirect(userId);setConversations(prev=>[conv,...prev.filter(c=>c.id!==conv.id)]);await loadThread(conv);setSearch('');setPeople([]);}
    catch(e){setError(e instanceof Error?e.message:'Could not open chat');}
  }
  async function onSend(){
    if(!active||!text.trim()||busy)return;
    const body=text.trim();setBusy(true);
    try{
      if(editing){await editMessage(editing.id,body);setMessages(prev=>prev.map(m=>m.id===editing.id?{...m,body,edited_at:new Date().toISOString()}:m));setEditing(null);}
      else{const msg=await sendText(active.id,body,reply?.id??null);setMessages(prev=>prev.some(m=>m.id===msg.id)?prev:[...prev,msg]);setReply(null);}
      setText('');
    }catch(e){setError(e instanceof Error?e.message:'Send failed');}
    finally{setBusy(false);}
  }
  async function inviteGame(gameId:string){
    if(!active)return;setShowGames(false);
    try{const sess=await sendGameInvite(active.id,gameId);setSession(sess);setMessages(await listMessages(active.id));}
    catch(e){setError(e instanceof Error?e.message:'Invite failed');}
  }
  async function onAccept(sessionId:string){
    try{const sess=await acceptGameInvite(sessionId);setSession(sess);setMessages(await listMessages(active!.id));setEmbeddedOpen(true);
      if(sess.room_id){const players=await getRoomPlayers(sess.room_id);setSeat(players.find(p=>p.user_id===uid)?.seat??1);}
    }catch(e){setError(e instanceof Error?e.message:'Accept failed');}
  }
  async function onDecline(sessionId:string){
    try{await declineGameInvite(sessionId);setSession(null);setMessages(await listMessages(active!.id));}
    catch(e){setError(e instanceof Error?e.message:'Decline failed');}
  }
  async function startEmbeddedMatch(){
    if(!session?.room_id||!uid)return;
    try{const initial=session.game_id==='tic-tac-toe'?{ttt:{board:Array(9).fill(null),turn:'X',winner:null,isDraw:false,moves:0}}:{};
      const match=await startRoomMatch(session.room_id,initial);setMatchId(match.id);setEmbeddedOpen(true);
    }catch(e){setError(e instanceof Error?e.message:'Could not start the online match. Ask the room host to start it.');}
  }
  async function uploadFile(file:File){
    if(!active)return;setBusy(true);
    try{const msg=await sendAttachment(active.id,file);setMessages(prev=>prev.some(m=>m.id===msg.id)?prev:[...prev,msg]);}
    catch(e){setError(e instanceof Error?e.message:'Upload failed');}
    finally{setBusy(false);if(fileRef.current)fileRef.current.value='';}
  }
  async function startRecording(){
    if(!active||!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){setError('Voice recording is not supported in this browser.');return;}
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      const recorder=new MediaRecorder(stream);chunksRef.current=[];recorderRef.current=recorder;
      recorder.ondataavailable=e=>{if(e.data.size)chunksRef.current.push(e.data);};
      recorder.onstop=async()=>{
        stream.getTracks().forEach(t=>t.stop());
        const blob=new Blob(chunksRef.current,{type:recorder.mimeType||'audio/webm'});
        if(blob.size){const file=new File([blob],`voice-note-${Date.now()}.webm`,{type:blob.type});setBusy(true);
          try{const msg=await sendAttachment(active.id,file,'voice');setMessages(prev=>prev.some(m=>m.id===msg.id)?prev:[...prev,msg]);}
          catch(e){setError(e instanceof Error?e.message:'Could not send voice note');}finally{setBusy(false);}
        }
      };
      recorder.start();setRecording(true);
    }catch(e){setError(e instanceof Error?e.message:'Microphone permission denied');}
  }
  function stopRecording(){recorderRef.current?.stop();setRecording(false);}

  async function makeGroup(){
    if(!groupTitle.trim())return;
    try{const conv=await createGroup(groupTitle,groupMembers);setConversations(prev=>[conv,...prev]);setGroupMode(false);setGroupTitle('');setGroupMembers([]);await loadThread(conv);}
    catch(e){setError(e instanceof Error?e.message:'Could not create group');}
  }

  function closePeer(){
    pcRef.current?.close();pcRef.current=null;
    streamRef.current?.getTracks().forEach(t=>t.stop());streamRef.current=null;
    if(remoteVideoRef.current)remoteVideoRef.current.srcObject=null;
    if(localVideoRef.current)localVideoRef.current.srcObject=null;
    pendingIceRef.current=[];setCurrentCall(null);activeCallRef.current=null;remoteIdRef.current=null;setCallState('');
  }
  async function makePeer(call:ChatCall,otherId:string){
    const iceServers=await getCallIceServers();
    const pc=new RTCPeerConnection({iceServers});pcRef.current=pc;
    remoteIdRef.current=otherId;activeCallRef.current=call;
    pc.ontrack=e=>{if(remoteVideoRef.current)remoteVideoRef.current.srcObject=e.streams[0];};
    pc.onicecandidate=e=>{if(e.candidate)void sendCallSignal(call.id,otherId,{type:'ice',candidate:e.candidate.toJSON()}).catch(err=>setError(err.message));};
    pc.onconnectionstatechange=()=>setCallState(pc.connectionState);
    const stream=await navigator.mediaDevices.getUserMedia({audio:true,video:call.call_type==='video'});
    streamRef.current=stream;stream.getTracks().forEach(track=>pc.addTrack(track,stream));
    if(localVideoRef.current)localVideoRef.current.srcObject=stream;
    const unsub=subscribeCallSignals(call.id,async(signal)=>{
      try{
        if(signal.type==='ready' && call.initiated_by===uid && !pc.localDescription){
          const offer=await pc.createOffer();await pc.setLocalDescription(offer);
          await sendCallSignal(call.id,otherId,{type:'offer',sdp:offer});
        }else if(signal.type==='offer'&&signal.sdp&&!pc.remoteDescription){
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp as RTCSessionDescriptionInit));
          for(const candidate of pendingIceRef.current)await pc.addIceCandidate(candidate);pendingIceRef.current=[];
          const answer=await pc.createAnswer();await pc.setLocalDescription(answer);
          await sendCallSignal(call.id,otherId,{type:'answer',sdp:answer});
        }else if(signal.type==='answer'&&signal.sdp&&pc.remoteDescription?.type!=='answer'){
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp as RTCSessionDescriptionInit));
          for(const candidate of pendingIceRef.current)await pc.addIceCandidate(candidate);pendingIceRef.current=[];
        }else if(signal.type==='ice'&&signal.candidate){
          const candidate=signal.candidate as RTCIceCandidateInit;
          if(pc.remoteDescription)await pc.addIceCandidate(candidate);else pendingIceRef.current.push(candidate);
        }else if(signal.type==='hangup'){signalUnsubRef.current?.();closePeer();}
      }catch(e){setError(e instanceof Error?e.message:'Call negotiation failed');}
    },()=>{if(call.initiated_by!==uid)void sendCallSignal(call.id,otherId,{type:'ready'}).catch(e=>setError(e.message));});
    return unsub;
  }
  const signalUnsubRef=useRef<(()=>void)|null>(null);
  async function beginCall(type:'audio'|'video'){
    if(!active||active.kind!=='direct'||members.length<2){setError('Calls are available in one-to-one chats only.');return;}
    const other=members.find(m=>m.id!==uid);if(!other)return;
    try{
      const call=await startCall(active.id,type);setCurrentCall(call);setCallState('calling');
      signalUnsubRef.current=await makePeer(call,other.id);
      window.setTimeout(()=>{void listCalls(active.id).then(rows=>{
        const latest=rows.find(row=>row.id===call.id);
        if(latest?.status==='ringing'){void updateCall(call.id,'missed');closePeer();}
      });},30000);
    }catch(e){setError(e instanceof Error?e.message:'Could not start call');if(currentCall)await updateCall(currentCall.id,'failed').catch(()=>{});closePeer();}
  }
  async function answerCall(){
    if(!incomingCall||!uid)return;
    const otherId=incomingCall.initiated_by;
    try{
      await updateCall(incomingCall.id,'accepted');setCurrentCall(incomingCall);setIncomingCall(null);setCallState('connecting');
      signalUnsubRef.current=await makePeer(incomingCall,otherId);
    }catch(e){setError(e instanceof Error?e.message:'Could not answer call');await updateCall(incomingCall.id,'failed').catch(()=>{});closePeer();}
  }
  async function endCall(){
    const call=activeCallRef.current??currentCall;
    if(call){const other=remoteIdRef.current;if(other)await sendCallSignal(call.id,other,{type:'hangup'}).catch(()=>{});
      await updateCall(call.id,'ended').catch(()=>{});}
    signalUnsubRef.current?.();signalUnsubRef.current=null;closePeer();
  }
  async function changePreference(key:Exclude<keyof Omit<ChatPreferences,'user_id'>,'allow_messages_from'>,value:boolean){
    const next={...(preferences??{show_online:true,show_last_seen:true,read_receipts:true,allow_group_invites:true,notify_messages:true,notify_calls:true,message_preview:true,allow_messages_from:'everyone',user_id:uid!}),[key]:value};
    try{await savePreferences({[key]:value});setPreferences(next as ChatPreferences);}
    catch(e){setError(e instanceof Error?e.message:'Could not save preference');}
  }
  async function handleTyping(){
    // Presence-safe ephemeral hint: no message content is sent.
    broadcastTyping(active?.id??'');
  }

  return <div className="chat-root page-stack">
    <header className="chat-header"><div><p className="eyebrow">PILLAR 03</p><h1>Chat</h1></div>
      <div className="chat-header-actions">
        {uid&&<button type="button" className="icon-button" title="Create group" onClick={()=>setGroupMode(v=>!v)}><Users size={18}/></button>}
        {active&&<details className="chat-settings"><summary aria-label="Chat privacy settings">Privacy</summary>
          <div className="chat-settings-panel"><strong>Chat privacy</strong>
            {([
              ['show_online','Show online status'],['show_last_seen','Show last seen'],['read_receipts','Read receipts'],
              ['allow_group_invites','Allow group invitations'],['notify_messages','Message notifications'],['notify_calls','Call notifications'],
              ['message_preview','Show notification previews']
            ] as [Exclude<keyof Omit<ChatPreferences,'user_id'>,'allow_messages_from'>,string][]).map(([key,label])=><label key={key}><input type="checkbox" checked={preferences?.[key]??true} onChange={e=>void changePreference(key,e.target.checked)}/>{label}</label>)}
            <label className="chat-message-permission">Who can message me
              <select value={preferences?.allow_messages_from??'everyone'} onChange={e=>void savePreferences({allow_messages_from:e.target.value as 'everyone'|'following'|'none'}).then(()=>setPreferences(p=>p?{...p,allow_messages_from:e.target.value as 'everyone'|'following'|'none'}:p)).catch(e=>setError(e.message))}>
                <option value="everyone">Everyone</option><option value="following">People I follow</option><option value="none">Nobody new</option>
              </select>
            </label>
          </div>
        </details>}
      </div>
      {!uid&&<p className="muted notice">Sign in to message others and play games in chat.</p>}
    </header>
    {error&&<div className="games-error" role="alert">{error}<button onClick={()=>setError(null)} aria-label="Dismiss error"><X size={14}/></button></div>}
    {groupMode&&<section className="chat-group-create"><h3>New group</h3><input value={groupTitle} onChange={e=>setGroupTitle(e.target.value)} placeholder="Group name (required)"/>
      <input value={groupSearch} onChange={e=>{setGroupSearch(e.target.value);setSearch(e.target.value);}} placeholder="Search people to add"/>
      {groupSearch.trim()&&<div className="chat-group-results">{people.map(p=><label key={p.id}><input type="checkbox" checked={groupMembers.includes(p.id)} onChange={e=>setGroupMembers(v=>e.target.checked?[...v,p.id]:v.filter(id=>id!==p.id))}/>{p.display_name||p.username||p.id.slice(0,8)}</label>)}</div>}
      <button className="game-btn primary" onClick={()=>void makeGroup()} disabled={!groupTitle.trim()}>Create group</button><button className="games-btn" onClick={()=>setGroupMode(false)}>Cancel</button></section>}
    <div className="chat-layout">
      <aside className="chat-sidebar">
        <div className="chat-search"><Search size={16}/><input value={search} onChange={e=>{setSearch(e.target.value);setGroupSearch(e.target.value);}} placeholder="Find people to message" disabled={!uid}/></div>
        {people.length>0&&<ul className="chat-people">{people.filter(p=>p.id!==uid).map(p=><li key={p.id}><button type="button" onClick={()=>void startDirect(p.id)}>{p.display_name||p.username||p.id.slice(0,8)}</button></li>)}</ul>}
        <h3>Conversations</h3>
        {loading&&<p className="muted">Loading…</p>}
        {!loading&&conversations.length===0&&<p className="muted">No conversations yet. Search for a user to start.</p>}
        <ul className="chat-conv-list">{conversations.map(c=><li key={c.id}><button type="button" className={active?.id===c.id?'active':''} onClick={()=>void loadThread(c)}><MessageCircle size={16}/><span>{c.title||c.kind} · {c.id.slice(0,6)}</span></button></li>)}</ul>
        {active&&<><h3>Call history</h3><div className="chat-call-history">{calls.slice(0,8).map(c=><p key={c.id}><Phone size={13}/>{c.call_type} · {c.status} · {new Date(c.created_at).toLocaleString()}</p>)}</div></>}
      </aside>
      <section className="chat-thread">
        {!active?<div className="chat-empty"><p className="muted">Select or start a conversation.</p></div>:<>
          <div className="chat-thread-head"><div><strong>{active.title|| (active.kind==='group'?'Group conversation':'Direct conversation')}</strong>
            <p className="muted">{members.map(m=>m.display_name||m.username||'Member').join(', ')}</p>
            {active.kind==='direct'&&members.filter(m=>m.id!==uid).map(m=><small key={m.id} className="muted">{presence[m.id]?.is_online?'Online':presence[m.id]?.last_seen_at?`Last seen ${new Date(presence[m.id].last_seen_at).toLocaleString()}`:''}</small>)}
          </div>
          <div className="chat-call-actions">{active.kind==='direct'&&<><button className="icon-button" title="Audio call" onClick={()=>void beginCall('audio')}><Phone size={18}/></button><button className="icon-button" title="Video call" onClick={()=>void beginCall('video')}><Video size={18}/></button></>}</div></div>
          {incomingCall&&<div className="chat-incoming-call"><PhoneIncoming size={18}/> Incoming {incomingCall.call_type} call
            <button className="game-btn primary" onClick={()=>void answerCall()}>Answer</button><button className="games-btn" onClick={()=>void updateCall(incomingCall.id,'declined').then(()=>setIncomingCall(null))}>Decline</button></div>}
          {(currentCall||callState)&&<div className="chat-call-panel"><div><strong>{currentCall?.call_type==='video'?'Video call':'Audio call'}</strong><small>{callState||currentCall?.status}</small></div>
            <video ref={remoteVideoRef} autoPlay playsInline className="chat-remote-video"/>
            <video ref={localVideoRef} autoPlay muted playsInline className="chat-local-video"/>
            <button className="game-btn danger" onClick={()=>void endCall()}><PhoneOff size={16}/> End call</button>
          </div>}
          <div className="chat-message-search"><Search size={14}/><input value={messageSearch} onChange={e=>setMessageSearch(e.target.value)} placeholder="Search this conversation"/></div>
          <div className="chat-messages">
            {(searchResults??messages).map(m=><div key={m.id} className={`chat-bubble ${m.sender_id===uid?'mine':''}`}>
              {m.reply_to&&<small className="muted">↳ {messages.find(x=>x.id===m.reply_to)?.body?.slice(0,90)??'Original message unavailable'}</small>}
              {m.deleted_at?<p className="muted"><i>This message was deleted</i></p>:m.message_type==='game_invite'?
                <GameInviteCard gameId={String(m.metadata?.game_id??'game')} status={String(m.metadata?.status??session?.status??'invited')} inviterLabel={m.sender_id===uid?'you':m.sender_id.slice(0,8)} isMine={m.sender_id===uid}
                  onAccept={()=>void onAccept(String(m.metadata?.session_id))} onDecline={()=>void onDecline(String(m.metadata?.session_id))}
                  onOpen={()=>{setEmbeddedOpen(true);void startEmbeddedMatch();}}/>:
                m.message_type==='game_event'?<p className="chat-event">{m.body}</p>:
                m.message_type==='image'?<><img className="chat-attachment-image" src={String(m.attachment?.url??'')} alt={String(m.attachment?.file_name??'Shared image')}/><p>{m.body}</p></>:
                m.message_type==='video'?<><video className="chat-attachment-video" src={String(m.attachment?.url??'')} controls/><p>{m.body}</p></>:
                m.message_type==='voice'?<><audio src={String(m.attachment?.url??'')} controls preload="metadata"/><small>Voice note</small></>:
                m.message_type==='document'?<a href={String(m.attachment?.url??'')} target="_blank" rel="noreferrer">{String(m.attachment?.file_name??m.body??'Download document')}</a>:
                <p>{m.body}</p>}
              <div className="chat-message-meta"><time>{new Date(m.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</time>{m.edited_at&&<small>edited</small>}
                {m.sender_id===uid&&<small>{(receipts[m.id]??[]).some(r=>r.read_at)?`Read by ${(receipts[m.id]??[]).filter(r=>r.read_at).length}`:(receipts[m.id]??[]).some(r=>r.delivered_at)?`Delivered to ${(receipts[m.id]??[]).filter(r=>r.delivered_at).length}`:'Sent'}</small>}</div>
              {m.sender_id===uid&&!m.deleted_at&&<div className="chat-message-tools">{m.message_type==='text'&&<button title="Edit" onClick={()=>{setEditing(m);setText(m.body);}}><Pencil size={13}/></button>}<button title="Delete" onClick={()=>void deleteMessage(m.id).then(()=>setMessages(prev=>prev.map(x=>x.id===m.id?{...x,deleted_at:new Date().toISOString(),body:''}:x))).catch(e=>setError(e.message))}><Trash2 size={13}/></button></div>}
              {!m.deleted_at&&<button className="chat-reply-button" title="Reply" onClick={()=>setReply(m)}><Reply size={13}/></button>}
            </div>)}
          </div>
          {typing&&<p className="muted chat-typing">Typing…</p>}
          {embeddedOpen&&session&&<div className="chat-embedded-game"><div className="chat-embedded-head"><strong>{session.game_id}</strong><button type="button" className="games-btn ghost" onClick={()=>setEmbeddedOpen(false)}>Minimize</button></div>
            {session.game_id==='tic-tac-toe'&&matchId&&uid?<OnlineTicTacToe matchId={matchId} userId={uid} seat={seat} onDone={async()=>setMessages(await listMessages(active.id))}/>:
              session.game_id==='tic-tac-toe'?<TicTacToeBoard vsCpu={false} onGameEnd={async r=>{if(matchId&&uid)await completeMatch(matchId,r==='draw'?null:uid,r==='draw',{}).catch(()=>{});}}/>:null}
            {session.game_id==='chess'&&<ChessBoard vsCpu={false}/>} {session.game_id==='ludo'&&<LudoBoard vsCpu={false}/>}
          </div>}
          {reply&&<div className="chat-compose-context"><Reply size={14}/> Replying to: {reply.body.slice(0,80)}<button onClick={()=>setReply(null)}><X size={14}/></button></div>}
          {editing&&<div className="chat-compose-context">Editing message<button onClick={()=>{setEditing(null);setText('');}}><X size={14}/></button></div>}
          <div className="chat-composer">
            <input ref={fileRef} type="file" hidden accept="image/*,video/mp4,video/webm,application/pdf,text/plain,.doc,.docx,.xls,.xlsx,.ppt,.pptx" onChange={e=>{const file=e.target.files?.[0];if(file)void uploadFile(file);}}/>
            <button className="icon-button" aria-label="Attach file" disabled={busy} onClick={()=>fileRef.current?.click()}><Paperclip size={18}/></button>
            <button className="icon-button" aria-label={recording?'Stop voice recording':'Record voice note'} disabled={busy} onClick={()=>recording?stopRecording():void startRecording()}>{recording?<Square size={17}/>:<Mic size={18}/>}</button>
            <div className="chat-composer-tools"><button type="button" className="icon-button" aria-label="Send game invite" disabled={!uid} onClick={()=>setShowGames(v=>!v)}><Gamepad2 size={18}/></button>
              {showGames&&<div className="chat-game-picker">{GAMES.map(g=><button key={g.id} type="button" onClick={()=>void inviteGame(g.id)}>{g.title}</button>)}</div>}</div>
            <input value={text} onChange={e=>{setText(e.target.value);void handleTyping();}} placeholder={editing?'Edit message…':'Message…'} onKeyDown={e=>e.key==='Enter'&&void onSend()} disabled={!uid||busy}/>
            <button type="button" className="game-btn primary" onClick={()=>void onSend()} disabled={!uid||!text.trim()||busy}><Send size={16}/></button>
          </div>
        </>}
      </section>
    </div>
    {active&&preferences?.notify_messages&&'Notification' in window&&Notification.permission==='default'&&<button className="chat-notification-optin" onClick={()=>void Notification.requestPermission()}>Enable message notifications</button>}
  </div>;
}
