(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NozzalaModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  'use strict';
  const states = [
    {name:'空闲', en:'IDLE', note:'没有正在进行的任务', color:'#0D0D0D'},
    {name:'工作中', en:'WORKING', note:'ChatGPT API 正在处理任务', color:'#0062FF'},
    {name:'完成未读', en:'UNREAD', note:'结果已就绪，等待查看', color:'#00FF7B'},
    {name:'等待批准/回复', en:'NEEDS INPUT', note:'需要你批准操作或回复信息', color:'#FFFF00'},
    {name:'错误', en:'ERROR', note:'任务遇到了问题', color:'#FF0000'}
  ];
  const effects = [[255,'默认'],[0,'关闭'],[1,'常亮'],[4,'呼吸'],[6,'浅呼吸'],[2,'跑灯'],[5,'渐变'],[3,'彩虹']];
  // Palette-only LED mixing, based on NeoPixel's 2.6 gamma recommendation.
  // Keep the user's five specified colors exact. This is not batch calibration.
  const presetGamma=2.6;
  function ledPresetColor(value) {
    const color=hex(value);
    if(states.some(s=>s.color===color)||color==='#000000') return color;
    const packed=parseInt(color.slice(1),16),rgb=[packed>>16,(packed>>8)&255,packed&255];
    const peak=Math.max(...rgb),tone=Math.pow(peak/255,presetGamma);
    const weights=rgb.map(v=>Math.pow(v/peak,presetGamma));
    const sum=weights.reduce((a,b)=>a+b,0);
    // Apply tone AFTER the 240-unit budget, so gray levels are not all capped white.
    const applied=normalize(weights.map(v=>Math.round(v/sum*240*tone)));
    return '#'+applied.map(v=>v.toString(16).padStart(2,'0')).join('').toUpperCase();
  }
  const ledPreset=([name,visual])=>[name,ledPresetColor(visual),visual];
  const colors = [
    ['柔白','#0D0D0D'],['晴蓝','#0062FF'],['薄荷绿','#00FF7B'],['明黄','#FFFF00'],
    ['正红','#FF0000'],['橙色','#FF8000'],['珊瑚','#FF6060'],['玫红','#FF0080'],
    ['紫色','#A040FF'],['靛蓝','#6040FF'],['青色','#00D4D4'],['暖白','#FFE0A0']
  ].map(ledPreset);
  const moreColors = [
    ['亮白','#FFFFFF'],['银灰','#C0C0C0'],['灰色','#999999'],['炭灰','#666666'],['柔白','#0D0D0D'],['黑色','#000000'],
    ['浅粉','#FFB6C1'],['粉红','#FF69B4'],['玫瑰','#FF1493'],['绯红','#DC143C'],['正红','#FF0000'],['酒红','#800020'],
    ['桃色','#FFDAB9'],['珊瑚','#FF7F50'],['橘橙','#FF8C00'],['金色','#FFD700'],['明黄','#FFFF00'],['奶油','#FFFACD'],
    ['淡绿','#98FB98'],['青柠','#BFFF00'],['草绿','#7CFC00'],['翠绿','#00C853'],['薄荷','#00FF7B'],['森林','#228B22'],
    ['浅青','#AFEEEE'],['绿松石','#40E0D0'],['青色','#00FFFF'],['天蓝','#87CEEB'],['晴蓝','#0062FF'],['海军蓝','#000080'],
    ['薰衣草','#E6E6FA'],['丁香','#C8A2C8'],['兰紫','#DA70D6'],['紫罗兰','#8A2BE2'],['靛蓝','#4B0082'],['洋红','#FF00FF']
  ].map(ledPreset);
  function hexToHsv(value) {
    const c=parseInt(hex(value).slice(1),16),[r,g,b]=[c>>16,(c>>8)&255,c&255].map(v=>v/255);
    const max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min;
    let h=0;
    if(delta) h=max===r?((g-b)/delta)%6:max===g?(b-r)/delta+2:(r-g)/delta+4;
    return [(h*60+360)%360,max?delta/max*100:0,max*100];
  }
  function hsvToHex(h,s,v) {
    if(![h,s,v].every(Number.isFinite)||h<0||h>360||s<0||s>100||v<0||v>100) throw new Error('颜色滑块数值超出范围');
    h=(h%360)/60;s/=100;v/=100;
    const c=v*s,x=c*(1-Math.abs(h%2-1)),m=v-c;
    const rgb=h<1?[c,x,0]:h<2?[x,c,0]:h<3?[0,c,x]:h<4?[0,x,c]:h<5?[x,0,c]:[c,0,x];
    return '#'+rgb.map(n=>Math.round((n+m)*255).toString(16).padStart(2,'0')).join('').toUpperCase();
  }
  function defaults() {
    return states.map(s => ({color:s.color, brightness:255, effect:255, speed:0, selectedEffect:255, selectedSpeed:0, followSpeed:3}));
  }
  function hex(value) {
    if (!/^#[\da-f]{6}$/i.test(value)) throw new Error('请输入 6 位颜色，例如 #0062FF');
    return value.toUpperCase();
  }
  function byte(value) { if (!Number.isInteger(value) || value<0 || value>255) throw new Error('配置数值超出范围'); return value; }
  function entryBytes(entry) {
    const c = parseInt(hex(entry.color).slice(1),16);
    const bytes = [c>>16,(c>>8)&255,c&255,byte(entry.brightness),byte(entry.effect),byte(entry.speed),byte(entry.selectedEffect),byte(entry.selectedSpeed),byte(entry.followSpeed)];
    if (!effects.some(e=>e[0]===bytes[4]) || !effects.some(e=>e[0]===bytes[6]) || bytes[8]>3) throw new Error('不支持的动画配置');
    return bytes;
  }
  function encode(config) {
    if (!Array.isArray(config) || config.length!==5) throw new Error('配置必须包含五种灯语');
    const bytes = new Uint8Array(config.flatMap(entryBytes));
    return bytes;
  }
  function decode(bytes) {
    if (bytes.length!==45) throw new Error('设备返回的配置长度不正确');
    const config = states.map((_,i)=>{const b=bytes.slice(i*9,i*9+9); return {
      color:'#'+[...b.slice(0,3)].map(v=>v.toString(16).padStart(2,'0')).join('').toUpperCase(),
      brightness:b[3],effect:b[4],speed:b[5],selectedEffect:b[6],selectedSpeed:b[7],followSpeed:b[8]
    };});
    encode(config);
    return config;
  }
  function update(config,index,patch) {
    const result=config.map(e=>({...e}));
    Object.assign(result[index],patch);
    encode(result); return result;
  }
  function normalize(rgb) {
    const sum=rgb.reduce((a,b)=>a+b,0);
    if (sum<=240) return [...rgb];
    const result=rgb.map(v=>Math.floor(v*240/sum));
    let remainder=240-result.reduce((a,b)=>a+b,0);
    for(let i=0;i<3 && remainder;i++) if(result[i]<rgb[i]) {result[i]++;remainder--;}
    return result;
  }
  const scale=(v,b)=>Math.floor((v*b+127)/255);
  function render(entry,selected,time,led=0) {
    const b=entryBytes(entry), index=selected?6:4;
    const effect=b[index]===255?(selected?4:1):b[index];
    const speed=(b[8]&(selected?2:1))?(selected?102:0):b[index+1];
    const phase=speed?((Math.floor(time)&65535)*(speed+1)>>8)&255:0;
    const tri=phase<128?phase*2:(255-phase)*2;
    let rgb=normalize(b.slice(0,3)), intensity=255;
    if(effect===0 || (effect===2 && phase%6!==led)) return [0,0,0];
    if(effect===3) {
      let p=(phase+led*43)&255;
      rgb=p<85?[255-p*3,p*3,0]:p<170?[0,255-(p-85)*3,(p-85)*3]:[(p-170)*3,0,255-(p-170)*3];
    } else if(effect===4) intensity=tri;
    else if(effect===5) intensity=255-((led+Math.floor(phase/43))%6)*25;
    else if(effect===6) intensity=127+Math.floor(tri/2);
    return normalize(rgb.map(v=>scale(v,intensity))).map(v=>scale(v,b[3]));
  }
  // Display only. PWM channel ratios approximate linear light; encode them for
  // the screen, then show power through source area and halo, not muddy alpha.
  // This is a perceptual preview, not a measured LED/monitor calibration.
  function emission(rgb) {
    const peak=Math.max(...rgb);
    if(!peak) return {color:'rgb(0,0,0)',strength:0,core:0,spread:0};
    const srgb=v=>v<=0.0031308?12.92*v:1.055*Math.pow(v,1/2.4)-0.055;
    const color=`rgb(${rgb.map(v=>Math.round(255*srgb(v/peak))).join(',')})`;
    const strength=Math.sqrt(Math.min(1,rgb.reduce((a,b)=>a+b,0)/240));
    return {color,strength,core:0.8+0.2*strength,spread:0.25+0.75*strength};
  }
  return {emission,states,effects,colors,moreColors,ledPresetColor,presetGamma,hexToHsv,hsvToHex,defaults,hex,entryBytes,encode,decode,update,render};
});
