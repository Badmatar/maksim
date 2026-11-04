'use client';
import {useRef,useState} from 'react';
import {ArrowRight,Check,Star} from 'lucide-react';
export function FeedbackForm({context='',onDone}:{context?:string;onDone:()=>void}){
 const [kind,setKind]=useState(context?'practice':'idea');const [rating,setRating]=useState<number|undefined>();const [message,setMessage]=useState('');const [contact,setContact]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [sent,setSent]=useState(false);
 const request=useRef<{id:string;content:string}|null>(null);
 async function submit(event:React.FormEvent){
  event.preventDefault();if(busy)return;setBusy(true);setError('');
  const payload={kind,rating,message:message.trim(),contact:contact.trim(),context};const content=JSON.stringify(payload);
  if(!request.current||request.current.content!==content)request.current={id:crypto.randomUUID(),content};
  try{
   const response=await fetch('/api/feedback',{method:'POST',headers:{'Content-Type':'application/json','X-Maksim-Client-Origin':window.location.origin},body:JSON.stringify({...payload,requestId:request.current.id})});
   const body=await response.json();if(!response.ok)throw new Error(body.error||'Не удалось отправить сообщение.');setSent(true);
  }catch(error){setError(error instanceof Error?error.message:'Не удалось отправить сообщение. Попробуйте позже.');}finally{setBusy(false);}
 }
 if(sent)return <section className="feedback-success" role="status"><Check size={38} strokeWidth={1}/><h2>Спасибо, что поделились</h2><p>Сообщение сохранено и доступно команде MAKSIM. Если вы оставили контакт, команда сможет ответить по нему.</p><button className="practice-cta" onClick={onDone}>На главную <ArrowRight size={17}/></button></section>;
 return <form className="feedback-form" onSubmit={submit}>
  {context&&<p className="feedback-context">{context}</p>}
  <label>О чём хотите написать?<select value={kind} onChange={event=>setKind(event.target.value)} disabled={busy}><option value="idea">Предложение</option><option value="question">Вопрос</option><option value="problem">Проблема в приложении</option><option value="practice">Впечатление от практики</option></select></label>
  <fieldset><legend>Как вам опыт? <small>Необязательно</small></legend><div className="feedback-stars">{[1,2,3,4,5].map(value=><label key={value} aria-label={`${value} из 5`}><input aria-label={`${value} из 5`} type="radio" name="rating" value={value} checked={rating===value} onChange={()=>setRating(value)} disabled={busy}/><Star size={29} strokeWidth={1.2} fill={rating&&rating>=value?'currentColor':'none'}/></label>)}{rating&&<button type="button" onClick={()=>setRating(undefined)} disabled={busy}>Убрать оценку</button>}</div></fieldset>
  <label>Ваше сообщение<textarea required minLength={10} maxLength={2000} rows={6} value={message} onChange={event=>setMessage(event.target.value)} placeholder="Что было полезно? Что хотелось бы изменить или уточнить?" disabled={busy}/><small>{message.length}/2000 · минимум 10 символов</small></label>
  <label>Контакт для ответа <small>Необязательно</small><input value={contact} maxLength={120} onChange={event=>setContact(event.target.value)} placeholder="Например, @username в Telegram" disabled={busy}/></label>
  <p className="builder-privacy">Сообщение, оценку и указанный контакт получит команда MAKSIM. Можно отправить без контакта. Ответы на вопросы конструктора не передаются.</p>
  {error&&<p className="feedback-error" role="alert">{error}</p>}
  <button className="practice-cta" type="submit" disabled={busy||message.trim().length<10}>{busy?'Сохраняем сообщение…':'Отправить обратную связь'}<ArrowRight size={17}/></button>
 </form>;
}
