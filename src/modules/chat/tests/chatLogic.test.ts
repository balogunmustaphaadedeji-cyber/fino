import { describe, expect, it } from 'vitest';
import { canEditChatMessage, classifyChatFile, validateChatText } from '../utils';

describe('chat message rules',()=>{
  it('trims text and rejects empty or oversized messages',()=>{
    expect(validateChatText('  hello  ')).toBe('hello');
    expect(()=>validateChatText('  ')).toThrow('cannot be empty');
    expect(()=>validateChatText('x'.repeat(10001))).toThrow('10,000');
  });
  it('classifies supported shared media by MIME and extension',()=>{
    expect(classifyChatFile({type:'image/png',name:'photo.png'})).toBe('image');
    expect(classifyChatFile({type:'video/mp4',name:'clip.mp4'})).toBe('video');
    expect(classifyChatFile({type:'application/pdf',name:'report.pdf'})).toBe('document');
  });
  it('enforces the fifteen-minute edit window',()=>{
    const now=Date.now();
    expect(canEditChatMessage(new Date(now-60_000).toISOString(),now)).toBe(true);
    expect(canEditChatMessage(new Date(now-16*60_000).toISOString(),now)).toBe(false);
  });
});
