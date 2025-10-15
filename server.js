const express = require('express');
const fetch = require('node-fetch');
const Parser = require('rss-parser');
const parser = new Parser();
const cron = require('node-cron');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const FEEDS_FILE = './feeds.json';
const fs = require('fs');

let cache = {items: [], ts:0};
const CACHE_TTL = (1000*60*60*4); // 4 hours

async function loadFeeds(){
  const f = JSON.parse(fs.readFileSync(FEEDS_FILE,'utf8'));
  return f;
}

async function fetchAll(){
  const feeds = await loadFeeds();
  const items = [];
  for(const url of feeds){
    try{
      const feed = await parser.parseURL(url);
      (feed.items||[]).forEach(it=>{
        items.push({
          title: it.title,
          link: it.link,
          pubDate: it.pubDate || it.isoDate || '',
          content: it.contentSnippet|| it.content || '',
          source: feed.title||url
        });
      });
    }catch(e){console.warn('feed error',url,e.message)}
  }
  items.sort((a,b)=>new Date(b.pubDate) - new Date(a.pubDate));
  cache = {items, ts: Date.now()};
  return items;
}

app.get('/api/top', async(req,res)=>{
  try{
    if(!cache.items.length || (Date.now()-cache.ts)>CACHE_TTL){
      await fetchAll();
    }
    res.json(cache.items.slice(0,100));
  }catch(e){res.status(500).json({error:e.message})}
});

// Telegram message
async function sendTelegramTop(){
  if(!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return console.warn('Telegram config missing');
  if(!cache.items.length) await fetchAll();
  const top = cache.items.slice(0,10);
  const text = '*Top Driver News — आज*\n\n' + top.map((t,i)=> `${i+1}. ${t.title} \n[Read](${t.link})`).join('\n\n') + '\n\n— All India Driver News';
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  await fetch(url,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({chat_id: TELEGRAM_CHAT_ID, text, parse_mode:'Markdown', disable_web_page_preview:false})
  });
}

// Cron: every day at 09:00 IST
cron.schedule('0 9 * * *', () => {
  console.log('Cron running: sendTelegramTop');
  sendTelegramTop().catch(e=>console.error(e));
}, {timezone: 'Asia/Kolkata'});

app.get('/health', (req,res)=>res.send('ok'));

app.listen(PORT, ()=>{ console.log('Server running on',PORT) });

// initial fetch
fetchAll().catch(e=>console.error(e));
