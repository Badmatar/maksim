'use client';
import { useEffect,useRef } from 'react';
export function TelegramLogin({username,url}:{username:string;url:string}){const ref=useRef<HTMLDivElement>(null);useEffect(()=>{if(!ref.current)return;const script=document.createElement('script');script.src='https://telegram.org/js/telegram-widget.js?22';script.async=true;script.dataset.telegramLogin=username;script.dataset.size='large';script.dataset.authUrl=url;script.dataset.requestAccess='write';ref.current.replaceChildren(script);return()=>ref.current?.replaceChildren();},[username,url]);return <div ref={ref}/>;}
