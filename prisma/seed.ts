import 'dotenv/config';
import { db } from '../lib/db';
import { defaultMenu } from '../lib/content';

async function main(){
 const settings={welcome:'Добро пожаловать в пространство практик Максима Машкова. Здесь можно остановиться, услышать себя и вернуться к настоящему.',about:'Максим Машков — психолог, психотерапевт и тренер личностного роста.',menu:defaultMenu,privacy:'Мы сохраняем Telegram ID, имя и историю заказов для предоставления услуг. Не отправляйте медицинские сведения. Отписка от предложений: /unsubscribe. Запрос удаления данных: через раздел «Консультация».'};
 for(const [key,value]of Object.entries(settings))await db.setting.upsert({where:{key},create:{key,value},update:{}});
 for(const [day,title,text] of [[1,'После практики','Как прошла ваша первая практика? Возвращайтесь к ней в удобное время.'],[3,'Библиотека','В разделе «Медитации» собраны практики для самостоятельной работы.'],[5,'Открытый канал','Загляните в раздел «Открытый канал», чтобы читать новые заметки Максима.'],[7,'Сообщество','В разделе «Сообщество» можно узнать о совместных практиках.']] as const)await db.automationStep.upsert({where:{id:`day-${day}`},create:{id:`day-${day}`,title,delayDays:day,text,enabled:false},update:{}});
 console.log('Default texts and disabled automation drafts created. No fake media or sales.');
}
main().finally(()=>db.$disconnect());
