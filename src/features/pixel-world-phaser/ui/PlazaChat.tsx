// 광장 한마디: 뭉게구름 말풍선 버튼 → 작은 입력창. 한글 입력(조합) 중 Enter는 보내지 않는다.
// 입력창에서 누른 키는 게임(방향키·A 버튼)으로 새지 않게 막는다.
import { useEffect, useRef, useState } from 'react';
import { CHAT_MAX_CHARS, normalizeChat } from '../../pixel-room/plaza/plazaChat';
import './plazaChat.css';

// 22×17 도트 뭉게구름 말풍선(꼬리 포함). # 테두리, . 바탕, , 그늘.
const CLOUD = [
  '      ####    ####    ',
  '    ##....####....#   ',
  '   #..............##  ',
  ' ##.................# ',
  '#...................# ',
  '#....................#',
  '#....................#',
  '#....................#',
  ' #..................# ',
  ' #,................,# ',
  '  #,,,..........,,,#  ',
  '   ###,,,,,,,,,,###   ',
  '      ###,,,####      ',
  '        #,,#          ',
  '        #,#           ',
  '        ##            ',
];
const FILL: Record<string, string> = { '#': '#5b3926', '.': '#fff9ec', ',': '#ecdcc0' };
function CloudIcon() {
  return <svg className="pwp-chat-cloud" viewBox="0 0 22 16" shapeRendering="crispEdges" aria-hidden="true">
    {CLOUD.flatMap((row, y) => [...row].map((c, x) => FILL[c] ? <rect key={x + ':' + y} x={x} y={y} width="1" height="1" fill={FILL[c]} /> : null))}
    <rect x="6" y="6" width="2" height="2" fill="#5b3926" /><rect x="10" y="6" width="2" height="2" fill="#5b3926" /><rect x="14" y="6" width="2" height="2" fill="#5b3926" />
  </svg>;
}

export type ChatResult = 'ok' | 'empty' | 'cooldown' | 'failed';
export function PlazaChat({ disabled, onSend, onStatus }: {
  disabled: boolean; onSend: (text: string) => Promise<ChatResult>; onStatus: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const composing = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  const send = async () => {
    if (sending || composing.current) return;
    if (!normalizeChat(text)) { onStatus('할 말을 적어 주세요.'); return; }
    setSending(true);
    const result = await onSend(text);
    setSending(false);
    if (result === 'ok') { setText(''); onStatus(''); }
    else onStatus(result === 'cooldown' ? '조금만 천천히 보내요.' : result === 'empty' ? '할 말을 적어 주세요.' : '한마디를 보내지 못했어요. 잠시 후 다시 해 주세요.');
    input.current?.focus();
  };
  const length = Array.from(text).length;
  return <>
    <button type="button" className="pwp-chip pwp-chat-button" aria-label="한마디 하기" aria-expanded={open} disabled={disabled}
      onClick={() => setOpen(value => !value)}><CloudIcon /></button>
    {open && <form className="pwp-chat-form" aria-label="광장 한마디"
      onSubmit={event => { event.preventDefault(); void send(); }}
      onKeyDown={event => event.stopPropagation()} onKeyUp={event => event.stopPropagation()}
      onPointerDown={event => event.stopPropagation()}>
      <input ref={input} type="text" value={text} maxLength={CHAT_MAX_CHARS} enterKeyHint="send" autoComplete="off" aria-label="한마디"
        placeholder="친구들에게 한마디 (40자)"
        onChange={event => setText(event.target.value)}
        onCompositionStart={() => { composing.current = true; }}
        onCompositionEnd={event => { composing.current = false; setText(event.currentTarget.value); }}
        onKeyDown={event => {
          if (event.key === 'Escape') { event.preventDefault(); setOpen(false); return; }
          if (event.key !== 'Enter') return;
          // 한글 조합 중 Enter는 글자를 확정할 뿐이다(Safari는 keyCode 229로 알려 준다). 조합은 건드리지 않는다.
          if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229) return;
          event.preventDefault();
          void send();
        }} />
      <span className="pwp-chat-count" aria-hidden="true">{length}/{CHAT_MAX_CHARS}</span>
      <button type="submit" className="pwp-chip" disabled={sending || !normalizeChat(text)}>보내기</button>
      <button type="button" className="pwp-chip pwp-chat-close" aria-label="한마디 닫기" onClick={() => setOpen(false)}>✕</button>
    </form>}
  </>;
}
