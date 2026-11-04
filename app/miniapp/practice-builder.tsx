'use client';
import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,Check,Copy,Pause,Play,Sparkles} from 'lucide-react';
import {builderQuestions,buildPractice,completeAnswers,planText,type BuilderAnswers,type PracticePlan} from '@/lib/practice-builder';
export function PracticeBuilder({onFeedback}:{onFeedback:(context:string)=>void}){
 const [answers,setAnswers]=useState<Partial<BuilderAnswers>>({});
 const [question,setQuestion]=useState(0);const [phase,setPhase]=useState<'questions'|'result'|'session'|'finished'>('questions');
 const [plan,setPlan]=useState<PracticePlan|null>(null);const [copyNotice,setCopyNotice]=useState('');
 const heading=useRef<HTMLHeadingElement>(null);
 useEffect(()=>{heading.current?.focus();},[question,phase]);
 const current=builderQuestions[question];
 function generate(){if(!completeAnswers(answers))return;setPlan(buildPractice(answers));setPhase('result');setCopyNotice('');}
 if(phase==='session'&&plan)return <GuidedSession plan={plan} onFinish={()=>setPhase('finished')} />;
 if(phase==='finished'&&plan)return <div className="builder-complete"><Check size={36} strokeWidth={1}/><h2 ref={heading} tabIndex={-1}>Время для себя</h2><p>Практика завершена. Можно ненадолго остаться с ощущениями или вернуться к своим делам. Особенного результата от себя ждать не нужно.</p><button className="practice-cta" onClick={()=>onFeedback('Конструктор практики')}>Поделиться впечатлением <ArrowRight size={17}/></button><button className="practice-text-link" onClick={()=>setPhase('result')}>Посмотреть мою практику</button><button className="practice-text-link" onClick={()=>{setPhase('questions');setQuestion(0);}}>Изменить ответы</button></div>;
 if(phase==='result'&&plan)return <section className="builder-result"><p className="practice-material-tag">СОБРАНО ПО ВАШИМ ОТВЕТАМ</p><h2 ref={heading} tabIndex={-1}>{plan.title}</h2><p>{plan.rationale}</p><ol>{plan.steps.map((step,index)=><li key={step.title}><span>{index+1}</span><div><h3>{step.title}</h3><small>{duration(step.seconds)}</small><p>{step.instruction}</p></div></li>)}</ol><button className="practice-cta" onClick={()=>setPhase('session')}>Начать практику <Play size={17}/></button><button className="practice-text-link" onClick={async()=>{try{await navigator.clipboard.writeText(planText(plan));setCopyNotice('Текст практики скопирован.');}catch{setCopyNotice('Не удалось скопировать автоматически. Можно выделить текст на странице.');}}}><Copy size={15}/> Скопировать текст</button><p className="builder-copy-notice" role="status">{copyNotice}</p><button className="practice-text-link" onClick={()=>{setPhase('questions');setQuestion(0);}}>Изменить ответы</button><p className="builder-privacy">Ответы используются только в этом окне и не отправляются команде. Это последовательность упражнений на внимание из готовых материалов MAKSIM.</p></section>;
 return <section className="builder-questions"><p className="practice-material-tag">ВОПРОС {question+1} ИЗ {builderQuestions.length}</p><div className="builder-progress" aria-label={`Шаг ${question+1} из ${builderQuestions.length}`}>{builderQuestions.map((item,index)=><i key={item.key} data-complete={index<=question}/>)}</div><h2 ref={heading} tabIndex={-1}>{current.title}</h2><p>{current.hint}</p><fieldset><legend className="sr-only">{current.title}</legend>{current.options.map(option=><label className="builder-option" key={option.value}><input type="radio" name={current.key} checked={answers[current.key]===option.value} onChange={()=>setAnswers({...answers,[current.key]:option.value})}/><span>{option.label}</span><Check size={18}/></label>)}</fieldset><div className="builder-controls">{question>0&&<button className="builder-previous" onClick={()=>setQuestion(question-1)}><ArrowLeft size={16}/> Назад</button>}<button className="practice-cta" disabled={answers[current.key]===undefined} onClick={()=>question<builderQuestions.length-1?setQuestion(question+1):generate()}>{question===builderQuestions.length-1?'Собрать практику':'Продолжить'}<ArrowRight size={17}/></button></div><p className="builder-privacy">Можно выбрать комфортный вариант и изменить ответы перед началом. Ответы не отправляются на сервер.</p></section>;
}
function duration(seconds:number){return seconds>=60?`${Math.floor(seconds/60)} мин${seconds%60?` ${seconds%60} сек`:''}`:`${seconds} сек`;}
function clock(seconds:number){return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;}
function GuidedSession({plan,onFinish}:{plan:PracticePlan;onFinish:()=>void}){
 const [index,setIndex]=useState(0);const [remaining,setRemaining]=useState(plan.steps[0].seconds);const [running,setRunning]=useState(false);
 const deadline=useRef(0);const step=plan.steps[index];const title=useRef<HTMLHeadingElement>(null);
 useEffect(()=>{title.current?.focus();},[index]);
 useEffect(()=>{
  if(!running)return;
  deadline.current=Date.now()+remaining*1000;
  const update=()=>{const left=Math.max(0,Math.ceil((deadline.current-Date.now())/1000));setRemaining(left);if(left===0)setRunning(false);};
  const interval=setInterval(update,250);
  const hidden=()=>{if(document.hidden){update();setRunning(false);}};
  document.addEventListener('visibilitychange',hidden);
  return()=>{clearInterval(interval);document.removeEventListener('visibilitychange',hidden);};
  // remaining is captured when starting/resuming; ticks must not reset deadline.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[running,index]);
 function move(next:number){setRunning(false);setIndex(next);setRemaining(plan.steps[next].seconds);}
 return <section className="builder-session"><p className="practice-material-tag">ШАГ {index+1} ИЗ {plan.steps.length}</p><Sparkles size={30} strokeWidth={1}/><h2 ref={title} tabIndex={-1}>{step.title}</h2><p>{step.instruction}</p><div className="builder-clock" role="timer" aria-label="Осталось времени на шаг">{clock(remaining)}</div><p className="builder-timer-note">{remaining===0?'Время шага вышло. Переходите дальше, когда будете готовы.':running?'Можно поставить на паузу или перейти дальше.':'Нажмите «Запустить таймер», когда будете готовы.'}</p><button className="practice-cta" disabled={remaining===0} onClick={()=>setRunning(!running)}>{running?'Пауза':'Запустить таймер'}{running?<Pause size={18}/>:<Play size={18}/>}</button><button className="practice-cta builder-next" onClick={()=>index===plan.steps.length-1?onFinish():move(index+1)}>{index===plan.steps.length-1?'Завершить практику':'Следующий шаг'}<ArrowRight size={17}/></button>{index>0&&<button className="practice-text-link" onClick={()=>move(index-1)}>Предыдущий шаг</button>}<button className="practice-text-link" onClick={onFinish}>Завершить раньше</button><p className="builder-privacy">При сворачивании окна таймер ставится на паузу. Переход между шагами — по вашему нажатию.</p></section>;
}
