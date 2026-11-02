'use client';
import { useEffect,useRef,useState } from 'react';
export function TelegramLogin({username,url}:{username:string;url:string}){const ref=useRef<HTMLDivElement>(null);useEffect(()=>{if(!ref.current)return;const script=document.createElement('script');script.src='https://telegram.org/js/telegram-widget.js?22';script.async=true;script.dataset.telegramLogin=username;script.dataset.size='large';script.dataset.authUrl=url;script.dataset.requestAccess='write';ref.current.replaceChildren(script);return()=>ref.current?.replaceChildren();},[username,url]);return <div ref={ref}/>;}

export function LegacyTelegramLogin(props:{username:string;url:string}) {
 const [open,setOpen]=useState(false);
 return <details className="telegram-login-alternative" onToggle={event=>setOpen(event.currentTarget.open)}><summary>Другой способ: Telegram Login</summary>{open&&<TelegramLogin {...props}/>}</details>;
}
