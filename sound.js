(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.NozzalaSound=api;})(typeof globalThis!=='undefined'?globalThis:this,root=>{
  'use strict';
  const colors=['#FFB46B','#F5D976','#9CDE9D','#72DDD2','#8DBBFF','#C69BF1'];
  const bands=[60,160,400,1000,2500,6000,16000];
  const clamp=(x,low=0,high=1)=>Math.max(low,Math.min(high,Number.isFinite(x)?x:low));
  class Signal {
    constructor(){this.levels=Array(6).fill(0);this.average=0;this.pulse=0;this.time=0;this.lastBeat=-1;}
    process(frequency,wave,sampleRate,dt=1/60,sensitivity=50,mode='spectrum',brightness=.7){
      dt=clamp(dt,.001,.25);this.time+=dt;const gain=Math.pow(2,(clamp(sensitivity,0,100)-50)/25);
      let mean=0;for(const value of wave)mean+=Number.isFinite(value)?value:0;mean/=Math.max(1,wave.length);
      let power=0;for(const value of wave)power+=Number.isFinite(value)?(value-mean)**2:0;
      const rms=Math.sqrt(power/Math.max(1,wave.length))*gain,gate=clamp((rms-.0025)/.0075),level=gate*clamp((20*Math.log10(Math.max(rms,1e-9))+55)/40);
      const binHz=sampleRate/(frequency.length*2),boost=20*Math.log10(gain);
      const target=Array.from({length:6},(_,i)=>{
        let peak=-Infinity;const first=Math.max(1,Math.ceil(bands[i]/binHz)),last=Math.min(frequency.length,Math.ceil(bands[i+1]/binHz));
        for(let bin=first;bin<last;bin++)if(Number.isFinite(frequency[bin]))peak=Math.max(peak,frequency[bin]);
        return Number.isFinite(peak)?gate*clamp((peak+72+boost)/54):0;
      });
      this.average+=(level-this.average)*(1-Math.exp(-dt/.55));
      const beat=level>.18&&level>this.average*1.45&&this.time-this.lastBeat>.2;
      if(beat)this.lastBeat=this.time;
      this.pulse=Math.max(this.pulse*Math.exp(-dt/.16),beat?level:0,level*.45);
      for(let i=0;i<6;i++){
        const wanted=mode==='pulse'?this.pulse:target[i],tau=wanted>this.levels[i] ? .045 : .2;
        this.levels[i]+=(wanted-this.levels[i])*(1-Math.exp(-dt/tau));if(this.levels[i]<.004)this.levels[i]=0;
      }
      return {level,beat,lamps:this.levels.map((value,i)=>({color:colors[i],level:clamp(value)*clamp(brightness)}))};
    }
  }
  function errorText(error){
    if(['NotAllowedError','SecurityError'].includes(error?.name))return '未获得麦克风权限，请在地址栏允许使用麦克风后重试。';
    if(['NotFoundError','DevicesNotFoundError'].includes(error?.name))return '没有找到可用的麦克风。';
    if(['NotReadableError','TrackStartError'].includes(error?.name))return '麦克风不可用，可能被其他应用占用。';
    return error?.message||'无法开启麦克风，请重试。';
  }
  class Microphone {
    constructor({env=root,onState=()=>{},onInterrupted=()=>{}}={}){this.env=env;this.onState=onState;this.onInterrupted=onInterrupted;this.state='idle';this.generation=0;this.pending=null;this.context=null;this.stream=null;this.source=null;this.analyser=null;}
    async start(){
      if(this.state!=='idle'||this.pending)return false;
      const env=this.env,Context=env.AudioContext||env.webkitAudioContext;
      if(env.isSecureContext===false||!env.navigator?.mediaDevices?.getUserMedia||!Context)throw new Error('当前浏览器无法使用麦克风，请在 HTTPS 页面或 localhost 打开。');
      const generation=++this.generation;this.state='requesting';this.onState();
      try{
        const context=this.context=new Context({latencyHint:'interactive'});await context.resume();
        if(generation!==this.generation)return false;
        if(context.state!=='running')throw new Error('音频分析无法启动，请重试。');
        const request=this.pending=env.navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:false});
        this.onState();
        let stream;try{stream=await request;}finally{if(this.pending===request){this.pending=null;this.onState();}}
        if(generation!==this.generation){stream.getTracks().forEach(track=>track.stop());return false;}
        this.stream=stream;if(!stream.getAudioTracks().length)throw new Error('没有找到可用的麦克风。');
        const analyser=this.analyser=context.createAnalyser();analyser.fftSize=4096;analyser.smoothingTimeConstant=.45;
        this.frequency=new Float32Array(analyser.frequencyBinCount);this.wave=new Float32Array(analyser.fftSize);
        this.source=context.createMediaStreamSource(stream);this.source.connect(analyser);
        // Analyse only. No destination, monitor, recorder, upload or persistent audio data.
        const interrupt=()=>{if(generation!==this.generation)return;this.stop();this.onInterrupted();};
        for(const track of stream.getTracks()){track.addEventListener('ended',interrupt);track.addEventListener('mute',interrupt);}
        context.addEventListener('statechange',()=>{if(this.state==='listening'&&context.state!=='running')interrupt();});
        this.state='listening';this.onState();return true;
      }catch(error){if(generation!==this.generation)return false;await this.stop();throw error;}
    }
    sample(){
      if(this.state!=='listening')return null;
      this.analyser.getFloatFrequencyData(this.frequency);this.analyser.getFloatTimeDomainData(this.wave);
      return {frequency:this.frequency,wave:this.wave,sampleRate:this.context.sampleRate};
    }
    async stop(){
      ++this.generation;this.state='idle';const context=this.context,stream=this.stream,source=this.source,analyser=this.analyser;
      this.context=this.stream=this.source=this.analyser=this.frequency=this.wave=null;
      stream?.getTracks().forEach(track=>track.stop());try{source?.disconnect();analyser?.disconnect();}catch{}
      this.onState();if(context&&context.state!=='closed')try{await context.close();}catch{}
    }
  }
  return {Signal,Microphone,errorText,colors,bands};
});
