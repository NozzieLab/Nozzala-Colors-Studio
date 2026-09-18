(() => {
  'use strict';
  const M=window.NozzalaModel,H=window.NozzalaHid,$=id=>document.getElementById(id);
  let config=M.defaults(), index=0, selected=false, edited=false, connection=null, busy=false, previewUntil=0;
  let singleScope=false,targetKey=0,testKey=null,testTimer=null;
  const keyPressed=Array(6).fill(false);
  const idleWaiters=[];
  let draggingColor=false, customEnabled=true, modeEdited=false;
  const presetPalette=M.colors.concat(M.moreColors);
  const swatchColor=color=>{
    const rgb=M.entryBytes({...M.defaults()[0],color}).slice(0,3),light=M.emission(rgb);
    if(!light.strength)return '#222629';
    return `radial-gradient(ellipse, ${light.color} 0%, ${light.color} ${20+light.strength*35}%, #353a3e 100%)`;
  };
  function paintSwatch(element,color,brightness=255,property='background') {
    const light=M.emission(M.render({...M.defaults()[0],color,brightness,effect:1},false,0));
    element.style.setProperty(property,swatchColor(color));
    element.style.setProperty('--swatch-light',light.color);
    element.style.setProperty('--swatch-power',`${Math.round(light.strength*65)}%`);
    element.style.setProperty('--swatch-blur',`${2+light.strength*6}px`);
  }
  function notice(message,error=false) { $('notice').textContent=message;$('notice').classList.toggle('error',error); }
  function controls() {
    const online=!!connection&&!connection.closed;
    $('custom-enabled').checked=customEnabled;
    $('custom-enabled').disabled=busy||testKey!==null||!online||!connection.supportsMode;
    $('lighting-workspace').classList.toggle('direct-mode',!customEnabled);
    $('mode-description').textContent=!online?'连接键盘后可更改此高级设置。':customEnabled?'默认开启。关闭后直接使用应用发送的灯光；点击保存后生效。':'高级模式：直接使用应用发送的灯光，自定义设置仍保留。';
    $('mode-compatibility').hidden=!(online&&!connection.supportsMode);
    $('connect').disabled=busy||online; $('connect').hidden=online;
    $('disconnect').hidden=!online;$('disconnect').disabled=busy;
    for(const id of ['save','load','stop-preview','lights-off']) $(id).disabled=busy||!online;
    for(const id of ['save','load'])$(id).disabled=busy||!online||testKey!==null;
    $('try-light').disabled=busy||!online||!customEnabled||testKey!==null;
    for(const id of ['scope-all','scope-one'])$(id).disabled=busy||testKey!==null;
    $('simulator-connection').textContent=online?'已连接':'离线预览';
    $('simulator-connection').classList.toggle('online',online);
    syncTestButton();
    renderKeyStates();
    const identity=online?connection.identity:null;
    $('firmware-version').textContent=online?(identity?`键盘 v${identity.pcbRevision} · 固件 v${identity.firmwareVersion}`:'版本未识别 · 可以正常调整灯光'):'连接键盘后可查看设备信息';
    $('connection-state').textContent=online?'设备已连接':'离线编辑';$('connection-state').classList.toggle('online',online);
    for(const id of ['reset-all','reset-one','import']) $(id).disabled=busy||testKey!==null;
    // Keep the exact saved snapshot stable while a device operation is in flight.
    document.querySelectorAll('.editor input,.editor select,.editor button').forEach(e=>e.disabled=busy||testKey!==null);
    if(!busy&&testKey===null) updateSpeed();
    window.NozzalaTheme?.refreshDevice();
  }
  $('custom-enabled').onchange=()=>{
    customEnabled=$('custom-enabled').checked;modeEdited=true;edited=true;
    $('draft-state').textContent='有尚未保存的更改';
    $('draft-detail').textContent='点击保存到设备后，开关和灯语一起生效';
    controls();
  };
  async function work(action,propagate=false) {
    if(busy){if(propagate)throw new Error('请等待上一步完成');return;}busy=true;controls();
    try {return await action();} catch(e) {notice(e.message||String(e),true);if(propagate)throw e;}
    finally {busy=false;controls();idleWaiters.splice(0).forEach(resolve=>resolve());}
  }
  async function eggWork(action){
    while(busy)await new Promise(resolve=>idleWaiters.push(resolve));
    return work(async()=>{
      if(!connection||connection.closed)throw new Error('设备未连接');
      clearTimeout(testTimer);testKey=null;previewUntil=0;syncTestButton();
      await action(connection);
    },true);
  }
  function status(flags) {
    $('storage-state').textContent=flags&2?'设备有尚未保存的临时配置':flags&1?'已读取键盘保存的灯语':'设备正在使用 默认灯语';
  }
  function changed(patch) {
    config=M.update(config,index,patch);edited=true;
    $('draft-state').textContent='有尚未保存的更改';$('draft-detail').textContent='修改仅保留在当前页面，试灯不会写入存储';
    renderStates();syncEditor();
  }
  function loadConfig(value,flags,message) {
    config=M.decode(M.encode(value));edited=false;modeEdited=false;
    $('draft-state').textContent=message;$('draft-detail').textContent='颜色与节奏已同步到页面';
    if(flags!==undefined) status(flags);
    renderStates();syncEditor();
  }
  function renderStates() {
    const host=$('state-list');host.replaceChildren();
    M.states.forEach((state,i)=>{
      const b=document.createElement('button');b.className='state-card';b.type='button';b.setAttribute('aria-pressed',String(index===i));
      b.innerHTML='<span class="swatch"></span><span class="label"><strong></strong><small></small></span><span class="arrow" aria-hidden="true"></span>';
      paintSwatch(b.querySelector('.swatch'),config[i].color,config[i].brightness);
      b.querySelector('.swatch').style.background=M.emission(M.entryBytes(config[i]).slice(0,3)).color;
      b.querySelector('strong').textContent=state.name;b.querySelector('small').textContent=['没有正在进行的任务','正在处理你的任务','有新结果待查看','需要你确认或回复','任务遇到问题'][i];
      b.querySelector('.arrow').textContent=index===i?'✓':'';
      b.onclick=()=>{if(busy)return;index=i;renderStates();syncEditor();};host.append(b);
    });
  }
  function palette() {
    M.colors.forEach(([name,color])=>{
      const b=document.createElement('button');b.className='color-chip';b.type='button';b.dataset.color=color;b.setAttribute('aria-label',name+' '+color);
      const dot=document.createElement('i');paintSwatch(dot,color);dot.setAttribute('aria-hidden','true');
      b.append(dot,document.createTextNode(name));b.onclick=()=>changed({color});$('palette').append(b);
    });
    M.moreColors.forEach(([name,color])=>{
      const b=document.createElement('button');b.className='extended-chip';b.type='button';b.dataset.color=color;
      b.title=name+' '+color;b.setAttribute('aria-label',name+' '+color);paintSwatch(b,color,255,'--chip');
      const label=document.createElement('span');label.textContent=name;b.append(label);
      b.onclick=()=>changed({color});$('extended-palette').append(b);
    });
  }
  function syncPicker() {
    const color=config[index].color;
    if(!draggingColor) {const hsv=M.hexToHsv(color);['hue','saturation','value'].forEach((id,i)=>$(id).value=hsv[i]);}
    const h=Number($('hue').value),s=Number($('saturation').value),v=Number($('value').value);
    $('hue-value').textContent=Math.round(h)+'°';$('saturation-value').textContent=Math.round(s)+'%';$('value-value').textContent=Math.round(v)+'%';
    $('saturation').style.background=`linear-gradient(to right, #FFFFFF, ${M.hsvToHex(h,100,100)})`;
    $('value').style.background=`linear-gradient(to right, #000000, ${M.hsvToHex(h,s,100)})`;
    paintSwatch($('picker-swatch'),color,config[index].brightness);
    $('picker-color-name').textContent=M.colors.concat(M.moreColors).find(c=>c[1]===color)?.[0]||'自定义颜色';
    $('picker-rgb').textContent='RGB '+M.entryBytes(config[index]).slice(0,3).join(' · ');
    document.querySelectorAll('.extended-chip').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.color===color)));
  }
  function updateSpeed() {
    const entry=config[index];
    for(const [selectId,sliderId,outId,bit,defaultSpeed] of [
      ['effect','speed','speed-value',1,0],['selected-effect','selected-speed','selected-speed-value',2,102]
    ]) {
      const effect=Number($(selectId).value),staticEffect=effect===0||effect===1;
      const value=entry.followSpeed&bit?defaultSpeed:entry[sliderId==='speed'?'speed':'selectedSpeed'];
      $(sliderId).value=value;
      $(sliderId).disabled=busy||staticEffect;
      $(outId).textContent=Math.round(value*100/255)+'%';
      $(sliderId).setAttribute('aria-valuetext',Math.round(value*100/255)+'%'+(value===defaultSpeed?'，默认':''));
    }
  }
  function syncEditor() {
    const entry=config[index],state=M.states[index];
    $('state-en').textContent=state.en;$('editor-title').textContent=state.name;$('state-description').textContent=state.note;
    $('linked-note').hidden=index!==3;
    const colorName=presetPalette.find(c=>c[1]===entry.color)?.[0]||'自定义颜色';
    $('color-name').textContent=colorName;
    $('current-color').hidden=M.colors.some(c=>c[1]===entry.color);
    $('current-color-name').textContent=colorName;
    $('current-color-value').textContent=entry.color;
    paintSwatch($('current-color-swatch'),entry.color,entry.brightness);
    document.querySelectorAll('.color-chip').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.color===entry.color)));
    $('hex').value=entry.color;syncPicker();
    $('brightness').value=entry.brightness;$('brightness-value').textContent=Math.round(entry.brightness*100/255)+'%';
    $('effect').value=entry.effect===255?1:entry.effect;$('speed').value=entry.speed;
    $('selected-effect').value=entry.selectedEffect===255?4:entry.selectedEffect;$('selected-speed').value=entry.selectedSpeed;
    updateSpeed();
  }
  function editRange(id,key) {$(id).addEventListener('input',()=>changed({[key]:Number($(id).value)}));}
  editRange('brightness','brightness');
  for(const [id,key,bit] of [['speed','speed',1],['selected-speed','selectedSpeed',2]])
    $(id).addEventListener('input',()=>changed({[key]:Number($(id).value),followSpeed:config[index].followSpeed&~bit}));
  for(const [id,key] of [['effect','effect'],['selected-effect','selectedEffect']]) {
    const defaultEffect=key==='effect'?1:4;
    M.effects.filter(([value])=>value!==255).forEach(([value,name])=>{const o=document.createElement('option');o.value=value;o.textContent=name+([2,5].includes(value)?'（多灯）':'')+(value===defaultEffect?'（默认）':'');$(id).append(o);});
    $(id).onchange=()=>{
      const effect=Number($(id).value),patch={[key]:effect===defaultEffect?255:effect};
      // Give an explicitly chosen animation a moving, useful initial speed.
      const bit=key==='effect'?1:2, speedKey=key==='effect'?'speed':'selectedSpeed';
      if(effect!==defaultEffect && effect>=2 && effect<=6 && (config[index].followSpeed&bit)) {patch[speedKey]=102;patch.followSpeed=config[index].followSpeed&~bit;}
      changed(patch);
    };
  }
  $('edit-current-color').onclick=()=>{$('custom-panel').hidden=false;$('custom-toggle').setAttribute('aria-expanded','true');$('hex').focus();};
  $('custom-toggle').onclick=()=>{const open=$('custom-panel').hidden;$('custom-panel').hidden=!open;$('custom-toggle').setAttribute('aria-expanded',String(open));};
  for(const id of ['hue','saturation','value']) $(id).addEventListener('input',()=>{
    draggingColor=true;
    try {changed({color:M.hsvToHex(...['hue','saturation','value'].map(i=>Number($(i).value)))});}
    finally {draggingColor=false;}
  });
  $('apply-color').onclick=()=>{try{changed({color:M.hex($('hex').value.trim())});notice('已使用自定义颜色，可以在设备上试灯。');}catch(e){notice(e.message,true);$('hex').focus();}};
  $('hex').addEventListener('keydown',event=>{if(event.key==='Enter')$('apply-color').click();});
  $('reset-one').onclick=()=>changed(M.defaults()[index]);
  $('reset-all').onclick=()=>{customEnabled=true;modeEdited=true;config=M.defaults();edited=true;renderStates();syncEditor();$('draft-state').textContent='已恢复 默认灯语';$('draft-detail').textContent='点击保存到设备后长期生效';notice('已恢复默认灯语并开启自定义，尚未写入设备。');controls();};
  function previewMode(value){selected=value;$('normal-preview').setAttribute('aria-pressed',String(!value));$('selected-preview').setAttribute('aria-pressed',String(value));}
  $('normal-preview').onclick=()=>previewMode(false);$('selected-preview').onclick=()=>previewMode(true);
  function renderKeyStates(){
    [...$('board').children].forEach((tile,i)=>{
      tile.classList.toggle('hardware-down',keyPressed[i]);
      tile.querySelector('.key-state').textContent=keyPressed[i]?'按下':'未按下';
    });
  }
  function resetKeyStates(){keyPressed.fill(false);renderKeyStates();}
  function onKey({key,pressed,time}){keyPressed[key]=pressed;renderKeyStates();window.NozzalaTheme?.deviceKey({key,pressed,time});}
  function syncTestButton(){
    const testing=previewUntil>0||testKey!==null;
    $('try-light').textContent=testing?'正在试灯…':'试灯 · 5 秒';
    $('stop-preview').hidden=!testing;
  }
  function scope(value){
    singleScope=value;$('scope-all').setAttribute('aria-pressed',String(!value));$('scope-one').setAttribute('aria-pressed',String(value));
    $('scope-note').textContent=value?'其他灯会关闭；5 秒后熄灭测试灯。':'5 秒后恢复原灯光。';
    $('target-label').textContent=value?'试亮灯位':'六个灯一起试亮';
    $('target-key').hidden=!value;$('target-key').textContent=String(targetKey+1).padStart(2,'0');
    [...$('board').children].forEach((k,i)=>{const target=value&&targetKey===i;k.classList.toggle('target',target);k.setAttribute('aria-pressed',String(target));});
  }
  $('scope-all').onclick=()=>scope(false);$('scope-one').onclick=()=>scope(true);
  for(let i=0;i<6;i++){
    const k=document.createElement('button');k.type='button';k.className='key';k.setAttribute('aria-pressed','false');
    const label=document.createElement('span');label.className='key-number';label.id=`key-number-${i}`;label.textContent=String(i+1).padStart(2,'0');
    const status=document.createElement('span');status.className='key-state';status.id=`key-status-${i}`;
    k.setAttribute('aria-labelledby',`${label.id} ${status.id}`);
    k.onclick=()=>{if(busy||testKey!==null)return;targetKey=i;scope(true);};
    const well=document.createElement('span');well.className='key-light-well';well.setAttribute('aria-hidden','true');
    const light=document.createElement('i');light.className='key-light';well.append(light);k.append(label,status,well);$('board').append(k);
  }
  const lights=[...document.querySelectorAll('.key-light')];
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  function animate(time){
    const entry=config[index],effect=selected?entry.selectedEffect:entry.effect;
    const advice=[2,5].includes(effect)?'跑灯和渐变适合多个灯。单灯会间歇熄灭或跳变，建议使用常亮、呼吸或浅呼吸。':'';
    if($('effect-advice').dataset.effect!==String(effect)){$('effect-advice').dataset.effect=String(effect);$('effect-advice').textContent=advice;}
    const preset=effect!==3?presetPalette.find(p=>p[1]===entry.color):null;
    const visual=preset?parseInt(preset[2].slice(1),16):null;
    const visualRgb=visual===null?null:[visual>>16,(visual>>8)&255,visual&255];
    if(!document.hidden) lights.forEach((light,i)=>{
      const rgb=singleScope&&i!==targetKey?[0,0,0]:M.render(config[index],selected,reduced.matches?320:time,i),peak=Math.max(...rgb);
      const screen=visualRgb||rgb,screenPeak=Math.max(...screen);
      light.style.setProperty('--light',`rgb(${screen.map(c=>screenPeak?Math.round(c*255/screenPeak):0).join(',')})`);
      // Display transfer only: make low-current light visible on a screen.
      // The device model, saved RGB, brightness and true black stay unchanged.
      light.style.opacity=peak?String(Math.pow(peak/240,.25)):'0';
    });
    if(previewUntil && performance.now()>previewUntil){previewUntil=0;syncTestButton();}
    requestAnimationFrame(animate);
  }
  async function connectDevice(){
    if(!navigator.hid||!window.isSecureContext) throw new Error('请在桌面 Chrome 或 Edge 中，通过本机启动地址或 HTTPS 打开。');
    const devices=await navigator.hid.requestDevice({filters:[H.filter]});if(!devices.length)return;
    const candidate=new H.Connection(devices[0],()=>{connection=null;previewUntil=0;clearTimeout(testTimer);testKey=null;resetKeyStates();$('storage-state').textContent='设备已断开';notice('设备已断开，页面中的配置仍保留。');controls();},onKey);
    resetKeyStates();
    try{const r=await candidate.open();connection=candidate;
      if(!modeEdited||!candidate.supportsMode)customEnabled=r.enabled;
      if(!edited)loadConfig(r.config,r.flags,'已读取设备当前灯语');else status(r.flags);
      notice(edited?'设备已连接，保留了你的页面草稿。可以试灯或保存。':'设备已连接，已读取当前灯语。');
    }catch(e){await candidate.close().catch(()=>{});throw e;}
  }
  $('connect').onclick=()=>work(connectDevice);
  $('disconnect').onclick=()=>work(async()=>{if(testKey!==null)await endSingle();await connection.close();connection=null;previewUntil=0;clearTimeout(testTimer);testKey=null;resetKeyStates();$('storage-state').textContent='尚未连接设备';notice('已断开连接。已保存的灯语会继续在设备上生效。');});
  $('save').onclick=()=>work(async()=>{
    const snapshot=M.encode(config),mode=customEnabled;
    if(!connection.supportsMode&&!mode)throw new Error('此固件不支持关闭自定义灯语，请先升级固件。');
    if(connection.supportsMode)await connection.call(2,snapshot);
    const r=connection.supportsMode?await connection.call(9,[Number(mode)]):await connection.call(3,snapshot);
    if(connection.supportsMode&&r.enabled!==mode)throw new Error('未能确认开关状态，请重新保存。');
    if((r.flags&3)!==1||M.encode(r.config).some((v,i)=>v!==snapshot[i]))throw new Error('未能确认保存结果，请重新保存。');
    loadConfig(r.config,r.flags,'已保存到设备');$('draft-detail').textContent='重新插入设备后也会自动加载';notice(mode?'自定义灯语已开启并保存，拔线后也会保留。':'已保存：直接使用应用发送的灯光。自定义设置仍保留在键盘中。');
  });
  $('load').onclick=()=>work(async()=>{let r=await connection.call(4);if(connection.supportsMode)r=await connection.call(9);customEnabled=r.enabled??true;loadConfig(r.config,r.flags,r.flags&1?'已读取设备保存的灯语':'已读取 默认灯语');notice(r.flags&1?'已读取键盘保存的灯语。':'设备尚无有效保存，已载入 默认灯语。');});
  async function endSingle(){
    clearTimeout(testTimer);
    if(testKey!==null){const key=testKey;await connection.clearTestLight(key);testKey=null;}
    previewUntil=0;syncTestButton();
    notice('测试灯已熄灭。ChatGPT App 再次更新时会显示当前状态。');
  }
  $('try-light').onclick=()=>work(async()=>{
    if(singleScope){
      testKey=targetKey;
      try{await connection.singleLight(testKey,config[index],selected);}
      catch(error){try{await endSingle();}catch{}throw error;}
      testTimer=setTimeout(()=>work(endSingle),5000);
      notice('单灯测试中，其他灯已关闭。请保持页面打开，5 秒后熄灭测试灯。');
    }else{
      await connection.call(6,[...M.entryBytes(config[index]),Number(selected)]);
      notice('正在设备上试灯，5 秒后回到 ChatGPT App 当前状态。配置尚未写入存储。');
    }
    previewUntil=performance.now()+5000;syncTestButton();
  });
  $('stop-preview').onclick=()=>work(async()=>{if(testKey!==null){await endSingle();return;}await connection.call(7);previewUntil=0;syncTestButton();notice('试灯已结束，恢复 ChatGPT App 当前灯语。');});
  $('lights-off').onclick=()=>work(async()=>{clearTimeout(testTimer);await connection.lightsOff();testKey=null;previewUntil=0;syncTestButton();notice('所有灯已熄灭。在 ChatGPT App 中切换聊天或触发状态更新，即可恢复灯光。');});
  $('export').onclick=()=>{
    const blob=new Blob([JSON.stringify({format:'nozzala-codex-customized',version:2,customEnabled,states:config},null,2)+'\n'],{type:'application/json'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='nozzala-colors-lights.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  $('import').onclick=()=>$('import-file').click();
  $('import-file').onchange=()=>work(async()=>{
    const file=$('import-file').files[0];$('import-file').value='';if(!file)return;if(file.size>16384)throw new Error('配置文件过大');
    const data=JSON.parse(await file.text());if(data.format!=='nozzala-codex-customized'||![1,2].includes(data.version))throw new Error('不是受支持的灯语备份');
    if(data.version===2&&typeof data.customEnabled!=='boolean')throw new Error('备份中的灯光开关无效');
    if(connection&&!connection.supportsMode&&data.version===2&&!data.customEnabled)throw new Error('此固件不支持关闭自定义灯语，请先升级固件。');
    const imported=M.decode(M.encode(data.states));customEnabled=data.version===1?true:data.customEnabled;loadConfig(imported,undefined,'已导入灯语草稿');modeEdited=true;edited=true;$('draft-detail').textContent='点击保存到设备后长期生效';notice('备份已导入页面，尚未写入设备。');
  });
  window.addEventListener('beforeunload',event=>{if(edited||testKey!==null){event.preventDefault();event.returnValue='';}});
  window.NozzalaTheme?.setDeviceBridge({
    get connected(){return !!connection&&!connection.closed;},
    get busy(){return busy;},
    connect:()=>work(connectDevice,true),
    colors:colors=>eggWork(device=>device.lightColors(colors)),
    mole:key=>eggWork(device=>device.moleLight(key)),
    rhythm:mask=>eggWork(device=>device.rhythmLights(mask)),
    audio:frame=>eggWork(device=>device.audioLights(frame)),
    off:()=>eggWork(device=>device.lightsOff())
  });
  palette();renderStates();syncEditor();controls();requestAnimationFrame(animate);
  if(!navigator.hid||!window.isSecureContext) notice('当前浏览器可离线编辑。连接设备请使用桌面 Chrome 或 Edge，直接打开本站 HTTPS 地址；本地运行也可使用 localhost。');
})();
