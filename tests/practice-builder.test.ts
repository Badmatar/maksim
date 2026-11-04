import {it,expect} from 'vitest';
import {buildPractice,completeAnswers,type BuilderAnswers} from '@/lib/practice-builder';
const defaults:BuilderAnswers={goal:'calm',minutes:3,energy:'steady',anchor:'support',position:'sitting'};
it('keeps every answer combination within its chosen time budget',()=>{
 for(const goal of ['calm','focus','body','evening'] as const)for(const minutes of [3,5,10] as const)for(const energy of ['low','steady','restless'] as const)for(const anchor of ['support','sounds','breathing'] as const)for(const position of ['sitting','standing'] as const){
  const plan=buildPractice({goal,minutes,energy,anchor,position});expect(plan.seconds).toBe(minutes*60);expect(plan.steps.reduce((total,step)=>total+step.seconds,0)).toBe(plan.seconds);expect(plan.steps.every(step=>step.seconds>0&&step.instruction.length>20)).toBe(true);
 }
});
it('never inserts breathing exercises when the person chooses support or sounds',()=>{
 for(const anchor of ['support','sounds'] as const){expect(JSON.stringify(buildPractice({...defaults,anchor}))).not.toMatch(/дыхани|вдох|выдох/i);}
 expect(JSON.stringify(buildPractice({...defaults,anchor:'breathing'}))).toContain('не задерживайте дыхание');
});
it('adapts instructions to position, energy and purpose',()=>{
 const plan=buildPractice({...defaults,goal:'evening',position:'standing',energy:'low'});
 expect(plan.steps[0].instruction).toContain('Встаньте устойчиво');expect(plan.rationale).toContain('Можно делать меньше');expect(plan.steps[2].instruction).toContain('один момент дня');
});
it('requires complete supported answers before generating a plan',()=>{
 expect(completeAnswers({})).toBe(false);expect(()=>buildPractice({...defaults,minutes:7} as unknown as BuilderAnswers)).toThrow('пять вопросов');
});
