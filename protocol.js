(function(root,factory) {
  const api=factory(typeof module==='object'&&module.exports?require('./model.js'):root.NozzalaModel);
  if(typeof module==='object'&&module.exports) module.exports=api; else root.NozzalaHid=api;
})(typeof globalThis!=='undefined'?globalThis:this,M=>{
  'use strict';
  const filter={vendorId:0x303A,productId:0x8360,usagePage:0xFF00,usage:1};
  function request(op,seq,payload=[]) {
    if(!Number.isInteger(op)||op<1||op>9||!Number.isInteger(seq)||seq<0||seq>255) throw new Error('无效命令');
    if(payload.length>56) throw new Error('配置过长');
    const bytes=new Uint8Array(63);
    bytes.set([3,5+payload.length,78,67,1,op,seq]); bytes.set(payload,7); return bytes;
  }
  function response(reportId,data) {
    const bytes=data instanceof DataView?new Uint8Array(data.buffer,data.byteOffset,data.byteLength):new Uint8Array(data);
    if(reportId!==6||bytes[0]!==3) return null;
    if(bytes.length!==63||(bytes[1]!==52&&!(bytes[1]===57&&bytes[5]===136))||bytes[2]!==78||bytes[3]!==67||bytes[4]!==1||!(bytes[5]&128)) throw new Error('暂时无法读取这台设备的灯语，请确认设备支持此功能');
    if(bytes[8]>(bytes[5]===137?7:3)) throw new Error('设备返回无效存储状态');
    let identity=null;
    if(bytes[5]===136 && bytes[7]===0) {
      if(bytes[1]!==57||![1,2].includes(bytes[54])||bytes[58]!==1) throw new Error('设备版本或灯光配置格式暂不支持，请更新网页');
      identity={pcbRevision:bytes[54],firmwareVersion:`${bytes[55]}.${bytes[56]}.${bytes[57]}`,lightingSchema:bytes[58]};
    }
    return {enabled:bytes[5]===137?!!(bytes[8]&4):undefined,identity,op:bytes[5]&127,seq:bytes[6],status:bytes[7],flags:bytes[8],config:M.decode(bytes.slice(9,54))};
  }
  // Channel 2 is newline-delimited JSON, potentially split across HID reports.
  class KeyEvents {
    constructor(onMessage=()=>{}){this.buffer='';this.onMessage=onMessage;}
    feed(reportId,data){
      const b=data instanceof DataView?new Uint8Array(data.buffer,data.byteOffset,data.byteLength):new Uint8Array(data);
      if(reportId!==6||b[0]!==2)return [];
      if(b.length!==63||b[1]>61){this.buffer='';return [];}
      const events=[];
      for(const c of b.slice(2,2+b[1])){
        if(c===10){
          try{const j=JSON.parse(this.buffer),p=j.p;this.onMessage(j);
            if(j.m==='v.oai.hid'&&/^AG0[0-5]$/.test(p?.k)&&[0,1].includes(p.act))events.push({key:Number(p.k.slice(-1)),pressed:p.act===1});
          }catch{}
          this.buffer='';
        }else {this.buffer+=String.fromCharCode(c);if(this.buffer.length>2048)this.buffer='';}
      }
      return events;
    }
  }
  class Connection {
    constructor(device,onDisconnect=()=>{},onKey=()=>{}) {
      this.keys=new KeyEvents(message=>{
        const p=this.pending;
        if(!p||p.jsonId===undefined||message.id!==p.jsonId)return;
        this.pending=null;clearTimeout(p.timer);
        if(message.error)p.reject(new Error('设备拒绝了试灯命令'));else p.resolve(message);
      });this.onKey=onKey;
      this.device=device; this.onDisconnect=onDisconnect; this.pending=null; this.seq=Math.floor(Math.random()*256); this.closed=false;
      this.input=event=>{
        for(const key of this.keys.feed(event.reportId,event.data))this.onKey({...key,time:event.timeStamp});
        try {
          const r=response(event.reportId,event.data), p=this.pending;
          if(!r||!p||p.seq!==r.seq||p.op!==r.op) return;
          this.pending=null; clearTimeout(p.timer);
          if(r.status) p.reject(Object.assign(new Error(({1:'固件版本不兼容',2:'设备拒绝了无效配置',3:'保存失败。当前灯语仅临时生效，请重新保存。',4:'固件不支持此操作'})[r.status]||'设备返回错误'),{status:r.status}));
          else p.resolve(r);
        } catch(e) { this.cancel(e); }
      };
      this.disconnect=event=>{if(event.device===this.device){this.dispose(new Error('设备已断开'));this.onDisconnect();}};
    }
    async open() {
      if(!this.device.opened) await this.device.open();
      this.device.addEventListener('inputreport',this.input);
      globalThis.navigator?.hid?.addEventListener('disconnect',this.disconnect);
      const current=await this.call(1);
      try {this.identity=(await this.call(8)).identity;}
      catch(error) {if(error.status!==4) throw error;this.identity=null;}
      try {
        const mode=await this.call(9);this.supportsMode=true;return mode;
      } catch(error) {
        if(error.status!==4) throw error;
        this.supportsMode=false;return {...current,enabled:true};
      }
    }
    call(op,payload=[]) {
      if(this.closed) return Promise.reject(new Error('设备未连接'));
      if(this.pending) return Promise.reject(new Error('请等待上一步完成'));
      const seq=this.seq=(this.seq+1)&255;
      return new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{this.cancel(new Error('设备没有回复。请重新连接，并确认键盘固件支持灯语设置。'));},2500);
        this.pending={op,seq,resolve,reject,timer};
        Promise.resolve().then(()=>this.device.sendReport(6,request(op,seq,payload))).catch(e=>this.cancel(e));
      });
    }
    rpc(method,params){
      if(this.closed)return Promise.reject(new Error('设备未连接'));
      if(this.pending)return Promise.reject(new Error('请等待上一步完成'));
      const id=700+(this.seq=(this.seq+1)&255);
      return new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>this.cancel(new Error('设备没有回复试灯命令')),2500);
        this.pending={jsonId:id,resolve,reject,timer};
        const bytes=new TextEncoder().encode(JSON.stringify({id,m:method,p:params})+'\n');
        (async()=>{for(let i=0;i<bytes.length;i+=61){
          if(this.closed)throw new Error('设备未连接');
          const part=bytes.slice(i,i+61),report=new Uint8Array(63);report.set([2,part.length]);report.set(part,2);
          await this.device.sendReport(6,report);
        }})().catch(e=>this.cancel(e));
      });
    }
    async singleLight(key,entry,selected){
      this.rhythmMask=null;
      if(!Number.isInteger(key)||key<0||key>5)throw new Error('无效灯位');
      M.entryBytes(entry);
      await this.call(7);
      // Each acknowledged request stays small enough for the CH552 parser.
      for(let i=0;i<6;i++)await this.rpc('v.oai.thstatus',[{id:i,c:0,b:0,e:0,s:0}]);
      const effect=selected?entry.selectedEffect:entry.effect;
      const speed=entry.followSpeed&(selected?2:1)?(selected?102:0):(selected?entry.selectedSpeed:entry.speed);
      await this.rpc('v.oai.thstatus',[{id:key,c:parseInt(entry.color.slice(1),16),b:Number((entry.brightness/255).toFixed(2)),e:effect===255?(selected?4:1):effect,s:Number((speed/255).toFixed(2))}]);
    }
    async lightsOff(){
      this.rhythmMask=null;
      await this.call(7);
      for(let i=0;i<6;i++)await this.rpc('v.oai.thstatus',[{id:i,c:0,b:0,e:0,s:0}]);
      await this.rpc('v.oai.rgbcfg',{keys:{c:0,b:0,e:0,s:0}});
      this.rhythmMask=0;
    }
    async lightColors(colors){
      this.rhythmMask=null;
      if(!Array.isArray(colors)||colors.length!==6)throw new Error('需要六个灯位的颜色');
      // Reuse the palette's display-to-LED mixing; firmware retains its limiter.
      const packed=colors.map(color=>parseInt(M.ledPresetColor(color).slice(1),16));
      await this.call(7);
      for(let id=0;id<6;id++)await this.rpc('v.oai.thstatus',[{id,c:packed[id],b:1,e:1,s:0}]);
    }
    async moleLight(key){
      if(key===null)return this.lightsOff();
      return this.singleLight(key,{...M.defaults()[0],color:M.ledPresetColor('#FFD35E'),effect:1},false);
    }
    async rhythmLights(mask){
      if(!Number.isInteger(mask)||mask<0||mask>63)throw new Error('无效灯位');
      const old=this.rhythmMask,changed=old===null||old===undefined?63:old^mask;
      const colors=['#90CCDB','#A4C97D','#E496A6','#DFB178','#C2A1E5','#89CABB'];
      try{
        for(const on of [false,true])for(let id=0;id<6;id++)if((changed&(1<<id))&&!!(mask&(1<<id))===on){
          await this.rpc('v.oai.thstatus',[{id,c:on?parseInt(M.ledPresetColor(colors[id]).slice(1),16):0,b:on?1:0,e:on?1:0,s:0}]);
        }
        this.rhythmMask=mask;
      }catch(error){this.rhythmMask=null;throw error;}
    }
    async clearTestLight(key){await this.rpc('v.oai.thstatus',[{id:key,c:0,b:0,e:0,s:0}]);}
    cancel(error) { if(this.pending){clearTimeout(this.pending.timer);this.pending.reject(error);this.pending=null;} }
    dispose(error=new Error('连接已关闭')) {
      this.closed=true;this.cancel(error);this.device.removeEventListener('inputreport',this.input);
      globalThis.navigator?.hid?.removeEventListener('disconnect',this.disconnect);
    }
    async close() {this.dispose();if(this.device.opened) await this.device.close();}
  }
  return {filter,request,response,Connection,KeyEvents};
});
