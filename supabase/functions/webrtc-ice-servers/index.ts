/**
 * Issues short-lived TURN REST credentials for authenticated FINO accounts.
 * Configure TURN_URLS and TURN_SHARED_SECRET as Supabase function secrets.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';

const encoder = new TextEncoder();
function json(status:number,body:Record<string,unknown>){
  return new Response(JSON.stringify(body),{status,headers:{
    'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Vary':'Origin'
  }});
}
async function hmacSha1Base64(secret:string,value:string):Promise<string>{
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-1'},false,['sign']);
  const signature=await crypto.subtle.sign('HMAC',key,encoder.encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}
Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response(null,{headers:{
    'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, content-type, apikey, x-client-info',
    'Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'
  }});
  if(req.method!=='POST')return json(405,{error:'method_not_allowed'});
  const url=Deno.env.get('SUPABASE_URL'),anon=Deno.env.get('SUPABASE_ANON_KEY');
  const turnUrls=(Deno.env.get('TURN_URLS')??'').split(',').map(v=>v.trim()).filter(Boolean);
  const sharedSecret=Deno.env.get('TURN_SHARED_SECRET');
  if(!url||!anon)return json(500,{error:'server_misconfigured'});
  const auth=req.headers.get('Authorization');
  if(!auth?.startsWith('Bearer '))return json(401,{error:'unauthenticated'});
  const supabase=createClient(url,anon,{global:{headers:{Authorization:auth}}});
  const {data:{user},error}=await supabase.auth.getUser();
  if(error||!user)return json(401,{error:'unauthenticated'});
  if(!turnUrls.length||!sharedSecret)return json(200,{iceServers:[],turnConfigured:false});
  const ttl=Math.min(Math.max(Number(Deno.env.get('TURN_TTL_SECONDS')??3600),300),86400);
  const username=`${Math.floor(Date.now()/1000)+ttl}:${user.id}`;
  const credential=await hmacSha1Base64(sharedSecret,username);
  return json(200,{iceServers:[{urls:turnUrls,username,credential}],turnConfigured:true,expiresIn:ttl});
});
