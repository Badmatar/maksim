import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'MAKSIM · Пространство практик',description:'Пространство практик Максима Машкова'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="ru"><body>{children}</body></html>;}
