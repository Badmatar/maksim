export type BuilderAnswers = { goal: 'calm'|'focus'|'body'|'evening'; minutes: 3|5|10; energy: 'low'|'steady'|'restless'; anchor: 'support'|'sounds'|'breathing'; position: 'sitting'|'standing' };
export type PracticePlan = { title: string; seconds: number; rationale: string; steps: { title: string; seconds: number; instruction: string }[] };
export const builderQuestions = [
  { key:'goal', title:'Что вам сейчас ближе?', hint:'Выберите одно направление — его можно изменить.', options:[{value:'calm',label:'Немного замедлиться'},{value:'focus',label:'Собраться перед делом'},{value:'body',label:'Почувствовать тело'},{value:'evening',label:'Бережно завершить день'}] },
  { key:'minutes', title:'Сколько времени у вас есть?', hint:'Оставим место для начала и спокойного завершения.', options:[{value:3,label:'3 минуты'},{value:5,label:'5 минут'},{value:10,label:'10 минут'}] },
  { key:'energy', title:'Как сейчас ощущается ваш темп?', hint:'Здесь нет правильного или неправильного ответа.', options:[{value:'low',label:'Сил немного, хочется мягче'},{value:'steady',label:'Достаточно ровно'},{value:'restless',label:'Много движения и мыслей'}] },
  { key:'anchor', title:'На чём удобнее удерживать внимание?', hint:'Дыхание — только один из вариантов. Можно обойтись без него.', options:[{value:'support',label:'На опоре: стопах и поверхности'},{value:'sounds',label:'На звуках вокруг'},{value:'breathing',label:'На естественном дыхании'}] },
  { key:'position', title:'Как вам удобнее расположиться?', hint:'Найдите безопасное место, где можно остановиться.', options:[{value:'sitting',label:'Сидя на устойчивом стуле'},{value:'standing',label:'Стоя с устойчивой опорой'}] },
] as const;
export function completeAnswers(value: Partial<BuilderAnswers>): value is BuilderAnswers {
  return builderQuestions.every(question=>question.options.some(option=>option.value===value[question.key]));
}
export function buildPractice(answers: BuilderAnswers): PracticePlan {
  if(!completeAnswers(answers))throw new Error('Ответьте на все пять вопросов.');
  const goals = {
    calm:{title:'Мягкое возвращение',instruction:'Посмотрите вокруг и найдите три спокойные для взгляда детали. Задержитесь на каждой: заметите цвет, контур или движение света. Затем спросите себя: «Что сделает следующие десять минут немного удобнее?» Не торопитесь с ответом.'},
    focus:{title:'Один следующий шаг',instruction:'Вспомните дело, к которому хотите вернуться. Отделите саму задачу от всего, что вы пытаетесь успеть одновременно. Назовите один небольшой шаг, который можно сделать первым. Остальные шаги пока могут подождать.'},
    body:{title:'В контакте с телом',instruction:'Последовательно замечайте ощущения в стопах, ладонях и плечах. Тепло, прохлада, давление или отсутствие ярких ощущений — всё подходит. Не нужно что-либо исправлять. Если хочется, немного измените положение, чтобы стало удобнее.'},
    evening:{title:'Достаточно на сегодня',instruction:'Вспомните один момент дня, который хочется сохранить. Затем отметьте, что потребовало сил, без оценки себя. Закончите фразу: «На сегодня достаточно…» Выберите одну небольшую заботу о себе на вечер, а остальное разрешите оставить до завтра.'},
  };
  const anchors = {
    support:{title:'Замечать опору',instruction:'Обратите внимание на прикосновение стоп к полу. Заметьте давление и температуру, а затем ещё одну точку соприкосновения тела с устойчивой поверхностью. Когда внимание отвлечётся, снова найдите одно простое ощущение опоры.'},
    sounds:{title:'Слушать пространство',instruction:'Прислушайтесь к ближайшему звуку, затем к более далёкому. Не нужно искать тишину или оценивать услышанное. Пусть звуки меняются, а вы время от времени замечаете один из них и возвращаетесь к слушанию.'},
    breathing:{title:'Следовать дыханию',instruction:'Заметьте, где естественное движение дыхания ощущается яснее: возле носа, в грудной клетке или животе. Не меняйте ритм и не задерживайте дыхание. Когда внимание отвлечётся, мягко вернитесь к одному обычному вдоху и выдоху.'},
  };
  const energy = {low:'Можно делать меньше и оставлять больше тишины между шагами.',steady:'Выберите удобный темп без стремления выполнить шаги идеально.',restless:'Если внимание скачет, отмечайте это и возвращайтесь к одной детали. Успокаиваться специально не требуется.'}[answers.energy];
  const position = answers.position==='sitting'?'Сядьте на устойчивый стул, почувствуйте сиденье и пол под стопами.':'Встаньте устойчиво там, где вам удобно и безопасно. При необходимости держитесь за устойчивую опору.';
  const timing = {3:[30,60,60,30],5:[40,100,120,40],10:[60,180,300,60]}[answers.minutes];
  const goal=goals[answers.goal],anchor=anchors[answers.anchor];
  return {title:goal.title,seconds:answers.minutes*60,rationale:`${answers.minutes} мин · ${answers.position==='sitting'?'сидя':'стоя'} · ${anchor.title.toLowerCase()}. ${energy}`,steps:[
    {title:'Устроиться удобно',seconds:timing[0],instruction:`${position} Глаза можно оставить открытыми. ${energy}`},
    {title:anchor.title,seconds:timing[1],instruction:anchor.instruction},
    {title:goal.title,seconds:timing[2],instruction:`${goal.instruction} Время от времени возвращайтесь к выбранной точке внимания: ${answers.anchor==='support'?'ощущениям опоры':answers.anchor==='sounds'?'звукам вокруг':'естественному дыханию'}.`},
    {title:'Вернуться к своему дню',seconds:timing[3],instruction:'Осмотритесь и почувствуйте поверхность под стопами. Заметьте, что осталось с вами после этой паузы. Необязательно чувствовать что-то особенное. Выберите одно посильное действие для заботы о себе. Можно завершить практику в любой момент.'},
  ]};
}
export function planText(plan: PracticePlan) {return `${plan.title}\n${plan.rationale}\n\n${plan.steps.map((step,index)=>`${index+1}. ${step.title} · ${step.seconds} сек\n${step.instruction}`).join('\n\n')}`;}
