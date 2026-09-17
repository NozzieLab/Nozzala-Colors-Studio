(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.NozzalaMole=api;
})(typeof globalThis!=='undefined'?globalThis:this,root=>{
  'use strict';
  const duration=60000;
  const levels={easy:{visible:1400,gap:400},normal:{visible:900,gap:280},hard:{visible:550,gap:180}};
  class Game {
    constructor({light,onChange=()=>{},now=()=>root.performance.now(),timers=root,random=Math.random}){
      this.light=light;this.onChange=onChange;this.now=now;this.timers=timers;this.random=random;
      this.phase='idle';this.difficulty='normal';this.target=null;this.held=Array(6).fill(false);
      this.hits=0;this.wrong=0;this.misses=0;this.token=0;this.feedback='';this.timer=null;this.reason='';this.error='';this.lastSnapshot='';
    }
    get active(){return this.phase==='starting'||this.phase==='playing';}
    snapshot(){return {phase:this.phase,difficulty:this.difficulty,target:this.target,hits:this.hits,wrong:this.wrong,misses:this.misses,score:Math.max(0,this.hits*10-this.wrong*5),remaining:this.phase==='playing'?Math.ceil(Math.max(0,this.deadline-this.now())/1000):this.phase==='finished'||this.phase==='finishing'?this.remaining:60,feedback:this.feedback,reason:this.reason,error:this.error};}
    emit(){const state=this.snapshot(),stamp=JSON.stringify(state);if(stamp!==this.lastSnapshot){this.lastSnapshot=stamp;this.onChange(state);}}
    async start(level='normal'){
      if(this.active||this.phase==='finishing')return;
      if(!Object.hasOwn(levels,level))throw new Error('无效难度');
      const token=++this.token;this.difficulty=level;this.hits=0;this.wrong=0;this.misses=0;
      this.target=null;this.lastTarget=-1;this.reason='';this.error='';this.feedback='';this.remaining=60;
      this.phase='starting';this.finishing=null;this.emit();
      try{await this.light(null);}catch(error){if(token===this.token){this.error=error.message;await this.stop('error');}return;}
      if(token!==this.token)return;
      this.phase='playing';this.deadline=this.now()+duration;this.readyAt=this.now();this.transitioning=false;
      this.tick();
    }
    tick(){
      if(this.phase!=='playing')return;
      const now=this.now();
      if(now>=this.deadline){this.stop('complete');return;}
      if(this.target!==null&&now>=this.expires){this.misses++;this.feedback='miss';this.retire();}
      if(this.target===null&&!this.transitioning&&now>=this.readyAt)this.spawn();
      this.emit();this.timer=this.timers.setTimeout(()=>this.tick(),50);
    }
    async spawn(){
      const token=this.token;this.transitioning=true;
      const choices=[0,1,2,3,4,5].filter(key=>key!==this.lastTarget);
      const key=choices[Math.min(choices.length-1,Math.floor(this.random()*choices.length))];
      try{await this.light(key);}catch(error){if(token===this.token){this.error=error.message;await this.stop('error');}return;}
      if(token!==this.token||this.phase!=='playing')return;
      if(this.now()>=this.deadline){this.stop('complete');return;}
      this.target=key;this.lastTarget=key;this.expires=this.now()+levels[this.difficulty].visible;this.transitioning=false;this.feedback='';this.emit();
    }
    async retire(){
      const token=this.token;this.target=null;this.transitioning=true;this.emit();
      try{await this.light(null);}catch(error){if(token===this.token){this.error=error.message;await this.stop('error');}return;}
      if(token!==this.token||this.phase!=='playing')return;
      this.transitioning=false;this.readyAt=this.now()+levels[this.difficulty].gap;this.emit();
    }
    key(key,pressed){
      if(!Number.isInteger(key)||key<0||key>5||typeof pressed!=='boolean')return;
      const repeat=this.held[key];this.held[key]=pressed;
      if(!pressed||repeat||this.phase!=='playing')return;
      if(this.now()>=this.deadline){this.stop('complete');return;}
      if(this.target===null)return;
      if(this.now()>=this.expires){this.misses++;this.feedback='miss';this.retire();return;}
      if(key===this.target){this.hits++;this.feedback='hit';this.retire();}
      else{this.wrong++;this.feedback='wrong';this.emit();}
    }
    stop(reason='cancelled'){
      if(this.finishing)return this.finishing;
      if(!this.active)return Promise.resolve();
      if(reason==='complete'&&this.target!==null)this.misses++;
      this.remaining=this.phase==='playing'?Math.ceil(Math.max(0,this.deadline-this.now())/1000):60;
      ++this.token;this.timers.clearTimeout(this.timer);this.timer=null;this.target=null;this.reason=reason;this.phase='finishing';this.emit();
      this.finishing=(async()=>{try{await this.light(null);}catch(error){this.error=error.message;}finally{this.phase='finished';this.emit();}})();
      return this.finishing;
    }
  }
  return {Game,levels,duration};
});
