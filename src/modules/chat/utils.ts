export type ChatAttachmentKind = 'image'|'video'|'document';

export function classifyChatFile(file: Pick<File,'type'|'name'>): ChatAttachmentKind {
  const mime=file.type.toLowerCase();
  if(mime.startsWith('image/')) return 'image';
  if(mime.startsWith('video/')) return 'video';
  if(mime.startsWith('audio/')) return 'document';
  const ext=file.name.split('.').pop()?.toLowerCase();
  if(['mp4','webm','mov'].includes(ext??'')) return 'video';
  if(['jpg','jpeg','png','webp','gif'].includes(ext??'')) return 'image';
  return 'document';
}
export function validateChatText(value:string):string {
  const text=value.trim();
  if(!text) throw new Error('Message cannot be empty.');
  if(text.length>10000) throw new Error('Message is too long (10,000 characters maximum).');
  return text;
}
export function canEditChatMessage(createdAt:string,now=Date.now()):boolean {
  const timestamp=Date.parse(createdAt);
  return Number.isFinite(timestamp)&&now-timestamp<=15*60*1000;
}
