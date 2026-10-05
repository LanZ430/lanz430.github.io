'use strict';
(() => {
  // Native canvas geometry, not a prerecorded animation. A quaternion trackball
  // drives both GPU surface rendering and the inverse-ray content hit test.
  const $ = selector => document.querySelector(selector);
  const stage = $('.atlas-art'), opening = $('.atlas-opening');
  const fragments = $('#fragments'), ctx = fragments.getContext('2d');
  const globe = $('#globe'), input = $('.globe-input'), meter = $('.atlas-progress');
  const portrait = $('.profile-portrait');
  const reduceQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const coarseQuery = matchMedia('(pointer: coarse)');
  const palette = ['#f3bcd0', '#a9cce8', '#b6dace'];
  const regions = [null,
    {region:'Asia', title:'Research', href:'#research', location:[104,34], color:1},
    {region:'North America', title:'Projects', href:'#projects', location:[-104,41], color:0},
    {region:'Europe', title:'Papers', href:'#publications', location:[20,53], color:2},
    {region:'South America', title:'Experience', href:'#background', location:[-60,-15], color:0},
    {region:'Africa', title:'About me', href:'#about', location:[20,4], color:2},
    {region:'Oceania', title:'Contact', href:'#contact', location:[134,-25], color:1},
    {region:'Antarctica', title:'', href:null, location:[0,-88], color:2}
  ];
  const copies = [...document.querySelectorAll('.atlas-copy')];
  const viewButtons = [...document.querySelectorAll('[data-view]')];
  const regionLinks = [...document.querySelectorAll('.world-links a')];
  const clamp = (n, a=0, b=1) => Math.max(a,Math.min(b,n));
  const lerp = (a,b,t) => a+(b-a)*t;
  const smooth = (a,b,n) => {const t=clamp((n-a)/(b-a));return t*t*(3-2*t);};
  const norm = a => {const n=Math.hypot(...a)||1;return a.map(v=>v/n);};
  const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const dot = (a,b) => a.reduce((s,v,i)=>s+v*b[i],0);
  const rad = d => d*Math.PI/180;
  const xyz = (lon,lat) => [Math.cos(rad(lat))*Math.sin(rad(lon)),Math.sin(rad(lat)),Math.cos(rad(lat))*Math.cos(rad(lon))];
  const qmul = (a,b) => [a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
  const qaxis = (axis,angle) => [...axis.map(v=>v*Math.sin(angle/2)),Math.cos(angle/2)];
  const inv = q => [-q[0],-q[1],-q[2],q[3]];
  const rotate = (q,v) => {const t=cross(q,v).map(x=>x*2),c=cross(q,t);return v.map((x,i)=>x+q[3]*t[i]+c[i]);};
  const defaultQ = qmul(qaxis([1,0,0],rad(18)),qaxis([0,1,0],rad(-25)));
  let orientation = [...defaultQ], kaleidoAngle = -.12;
  let w=0,h=0,dpr=1,radius=1,progress=0,rawProgress=0,manualProgress=0;
  let staticMode=reduceQuery.matches,visible=true,frameId=0,lastFrame=0,clock=0;
  let drag=null,inertia=null,hoverId=0,highlightId=0,lastCopy=-1,lastPhase='';
  let worldReady=false,worldFailed=false,renderer=null;
  let dirty=true,pointerPosition=null,lastProgress=-1;
  const initialTriangles=[];
  const polar = (r,a) => [Math.cos(a)*r,Math.sin(a)*r,0];
  const add = (vertices,color) => initialTriangles.push({vertices,color});
  // Alternating sectors create mirror repetition, not randomly scattered confetti.
  for(let sector=0;sector<18;sector++){
    const a=sector*Math.PI/9,b=(sector+1)*Math.PI/9;
    for(let ring=0;ring<7;ring++){
      const inner=ring/7,outer=(ring+1)/7;
      const color=(ring+(sector%2 ? 1 : 0))%3;
      if(ring===0)add([[0,0,0],polar(outer,a),polar(outer,b)],color);
      else{
        add([polar(inner,a),polar(outer,a),polar(outer,b)],color);
        add([polar(inner,a),polar(outer,b),polar(inner,b)],(color+1)%3);
      }
    }
  }
  const counts=[0,0,0];
  const totals=[0,1,2].map(c=>initialTriangles.filter(f=>f.color===c).length);
  const facets=initialTriangles.map(f=>({...f,index:counts[f.color]++}));
  stage.dataset.fragmentCount=facets.length;
  const labels=regions.slice(1,7).map((region,i)=>{
    const el=document.createElement('div');el.className='globe-label';el.dataset.region=region.region;
    const label=document.createElement('span');label.textContent=region.title;el.append(label);$('.globe-labels').append(el);
    return {el,region,id:i+1};
  });

  function resize(){
    const r=stage.getBoundingClientRect();w=r.width;h=r.height;
    dpr=Math.min(devicePixelRatio||1,2);radius=Math.min(w*.405,h*.435);
    stage.style.setProperty('--portrait-size',`${radius*2.2}px`);
    fragments.width=Math.round(w*dpr);fragments.height=Math.round(h*dpr);
    globe.width=Math.round(w*dpr);globe.height=Math.round(h*dpr);
    renderer?.resize();dirty=true;wake();
  }
  function drawFacets(gather,assemble,time){
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    if(gather>.999)return;
    const fade=1-smooth(.62,1,gather),angle=kaleidoAngle;
    const ca=Math.cos(angle),sa=Math.sin(angle);
    for(const f of facets){
      const target=PuzzleWorld.facet(f.color,f.index,totals[f.color],orientation);
      const vertices=f.vertices.map((p,j)=>{
        const first=[(p[0]*ca-p[1]*sa)*.99,(p[0]*sa+p[1]*ca)*.96];
        const wave=Math.sin(gather*Math.PI)*Math.sin(f.index*1.7)*.06;
        return [lerp(first[0],target[j][0],gather),lerp(first[1],-target[j][1],gather)+wave];
      });
      const center=[0,0];vertices.forEach(v=>{center[0]+=v[0]/3;center[1]+=v[1]/3;});
      ctx.beginPath();vertices.forEach((v,j)=>{const x=w/2+(center[0]+(v[0]-center[0])*.955)*radius,y=h/2+(center[1]+(v[1]-center[1])*.955)*radius;j?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.closePath();
      ctx.globalAlpha=fade*(.79+(f.index%4)*.065);ctx.fillStyle=palette[f.color];ctx.fill();
      ctx.globalAlpha=fade*.86;ctx.strokeStyle='#4f3a46';ctx.lineWidth=Math.max(.65,Math.min(1.25,radius/230));ctx.lineJoin='round';ctx.stroke();
    }
    ctx.globalAlpha=(1-gather)*.35;ctx.strokeStyle='#4f3a46';ctx.lineWidth=.7;ctx.beginPath();ctx.ellipse(w/2,h/2,radius*1.065,radius*1.025,angle,0,Math.PI*2);ctx.stroke();
    ctx.globalAlpha=(1-gather)*.15;ctx.beginPath();ctx.ellipse(w/2,h/2,radius*1.095,radius*1.055,angle,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;
  }
  function loadWorld(){
    try{renderer=PuzzleWorld.create(globe);renderer.resize();worldReady=true;stage.dataset.renderer=renderer.type;stage.dataset.geometry='three-rigid-jigsaw-shells';}
    catch(error){worldFailed=true;console.warn('Puzzle model could not initialize.',error);}
    dirty=true;wake();
  }
  function sampleMap(v){return PuzzleWorld.sampleRegion(v);}
  function hit(clientX,clientY){
    if(progress<.78||!worldReady)return 0;
    for(const {el,id} of labels){if(el.dataset.visible!=='true')continue;const r=el.getBoundingClientRect();if(clientX>=r.left&&clientX<=r.right&&clientY>=r.top&&clientY<=r.bottom)return id;}
    const r=stage.getBoundingClientRect(),x=(clientX-r.left-w/2)/radius,y=(h/2-clientY+r.top)/radius;
    if(x*x+y*y>1)return 0;
    const id=sampleMap(rotate(inv(orientation),[x,y,Math.sqrt(Math.max(0,1-x*x-y*y))]));return id===7?0:id;
  }
  function setHighlight(id){
    if(id===highlightId)return;highlightId=id;dirty=true;
    regionLinks.forEach(a=>a.dataset.highlight=String(regions[id]?.region===a.dataset.region));
    labels.forEach(({el,id:labelId})=>el.dataset.highlight=String(id===labelId));
    $('.destination-name').textContent=regions[id]?.title||'';
    $('.destination-detail').textContent=id?'Click to explore':'';
    $('.destination').style.opacity=id?'1':'0';input.dataset.hover=String(!!id);wake();
  }
  function updateLabels(assemble){
    const occupied=[];
    // Prioritize a hovered continent, then front-most locations; avoid overlapping labels.
    const items=labels.map(label=>({...label,p:rotate(orientation,xyz(...label.region.location))})).sort((a,b)=>(b.id===highlightId)-(a.id===highlightId)||b.p[2]-a.p[2]);
    for(const {el,p,id} of items){
      const show=assemble>.995&&p[2]>.30;
      const x=w/2+p[0]*radius,y=h/2-p[1]*radius;
      const width=el.offsetWidth||90,height=30;
      const collision=occupied.some(r=>Math.abs(x-r.x)<(width+r.width)/2+10&&Math.abs(y-r.y)<height+5);
      el.style.opacity=show&&!collision?'1':'0';el.style.transform=`translate(${(x-width/2).toFixed(1)}px,${(y-height/2).toFixed(1)}px)`;
      if(show&&!collision)occupied.push({x,y,width});
      el.dataset.visible=String(show&&!collision);el.dataset.highlight=String(id===highlightId);
    }
  }
  function progressValue(){
    if(staticMode)return manualProgress;
    if(CSS.supports('animation-timeline: view()'))return clamp(parseFloat(getComputedStyle(meter).opacity)||0);
    // Older browsers share the same story without installing a scroll listener.
    const r=opening.getBoundingClientRect();return clamp(-r.top/(r.height-innerHeight));
  }
  // Reserve the opening quarter for the lid, keeping the existing puzzle timeline intact.
  function openingState(raw,reduced){
    const reveal=smooth(.02,.24,raw);
    return {story:clamp((raw-.24)/.76),angle:reduced?0:110*reveal,
      lid:1-smooth(.65,1,reveal),profile:1-smooth(.04,.12,raw),intro:smooth(.12,.22,raw)};
  }
  function viewPosition(story){return story<0?0:.24+.76*clamp(story);}
  function updateCopy(p,cover){
    const weights=[cover.profile,cover.intro*(1-smooth(.18,.25,p)),smooth(.26,.33,p)*(1-smooth(.54,.60,p)),smooth(.61,.72,p)];
    const selected=weights.indexOf(Math.max(...weights));
    copies.forEach((el,i)=>{el.style.opacity=weights[i].toFixed(3);el.style.transform=`translateY(${((1-weights[i])*16).toFixed(1)}px)`;});
    if(selected!==lastCopy){
      copies.forEach((el,i)=>{el.inert=i!==selected;el.setAttribute('aria-hidden',String(i!==selected));});lastCopy=selected;
    }
    portrait.style.transform=`rotate(${cover.angle.toFixed(2)}deg)`;
    stage.style.setProperty('--lid-opacity',cover.lid.toFixed(3));
    portrait.setAttribute('aria-hidden',String(cover.lid<.05));
    input.inert=cover.lid>.01;
    const phase=cover.lid>.01?'profile':p<.27?'fragments':p<.69?'gather':'world';
    if(phase!==lastPhase){
      stage.dataset.phase=phase==='profile'?'fragments':phase;
      viewButtons.forEach((b,i)=>b.setAttribute('aria-pressed',String(i===({profile:0,fragments:1,gather:2,world:3}[phase]))));
      $('#art-help').textContent=phase==='profile'?(staticMode?'Choose Fragments to open the world.':'Scroll to open a world of possibilities.'):phase==='world'?'Drag in any direction. Hover a region, then click to explore.':phase==='gather'?'Three curved pieces. Scroll to bring their edges together.':'Fragments become a world as you move down the page.';
      $('.touch-rotate').hidden=!(coarseQuery.matches&&phase==='world');
      if(phase!=='world'){setHighlight(0);input.dataset.touch='false';$('.touch-rotate').setAttribute('aria-pressed','false');$('.touch-rotate').textContent='Enable rotation';}
      lastPhase=phase;
    }
  }
  function frame(now){
    frameId=0;if(!visible||document.hidden)return;
    const dt=Math.min((now-lastFrame)/1000||0,.04);lastFrame=now;
    const oldProgress=progress;rawProgress=progressValue();
    const cover=openingState(rawProgress,staticMode);progress=cover.story;
    const changed=Math.abs(rawProgress-lastProgress)>.00005;
    if(!staticMode)clock+=dt;
    const gather=smooth(.10,.37,progress),assemble=smooth(.50,.78,progress);
    const idle=false; // The story moves with input, not an endless idle loop.
    let moving=false;
    if(inertia&&!staticMode&&!drag&&progress>.78){
      inertia.speed*=Math.exp(-dt*5.5);
      if(inertia.speed<.008)inertia=null;
      else{orientation=norm(qmul(qaxis(inertia.axis,inertia.speed*dt),orientation));moving=true;}
    }
    if(dirty||changed||moving||idle){
      updateCopy(progress,cover);drawFacets(gather,assemble,clock);
      const globeOpacity=smooth(.52,.96,gather),canvas=renderer?.canvas||globe;canvas.style.opacity=String(globeOpacity);
      if(worldReady&&globeOpacity>0)renderer.draw({orientation,assemble,highlight:highlightId,w,h,radius,dpr});
      updateLabels(assemble);
      $('.atlas-fallback').hidden=!(assemble>.8&&!worldReady);
      $('.atlas-fallback').textContent=worldFailed?'The globe could not load. All sections remain available through the content index.':'Preparing the world. You can also use the content index.';
      if(pointerPosition&&!drag&&progress>.78){hoverId=hit(...pointerPosition);setHighlight(hoverId);}
      stage.dataset.progress=progress.toFixed(3);stage.dataset.openingProgress=rawProgress.toFixed(3);stage.dataset.rotation=orientation.map(x=>x.toFixed(4)).join(',');
      lastProgress=rawProgress;dirty=false;
    }
    if(oldProgress>.78&&progress<=.78)inertia=null;
    if(!staticMode)frameId=requestAnimationFrame(frame);
  }
  function wake(){if(!frameId&&visible&&!document.hidden){lastFrame=performance.now();frameId=requestAnimationFrame(frame);}}
  function trackPoint(clientX,clientY){
    const r=stage.getBoundingClientRect(),x=(clientX-r.left-w/2)/radius,y=(h/2-clientY+r.top)/radius;
    const d=x*x+y*y;return d<=1?[x,y,Math.sqrt(1-d)]:norm([x,y,0]);
  }
  input.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;
    if(event.pointerType==='touch'&&input.dataset.touch!=='true')return;
    const p=trackPoint(event.clientX,event.clientY);drag={id:event.pointerId,start:[event.clientX,event.clientY],p,time:performance.now(),distance:0};inertia=null;input.setPointerCapture(event.pointerId);input.classList.add('is-dragging');input.focus({preventScroll:true});
  });
  input.addEventListener('pointermove',event=>{
    pointerPosition=[event.clientX,event.clientY];
    if(!drag){hoverId=hit(event.clientX,event.clientY);setHighlight(hoverId);return;}
    if(event.pointerId!==drag.id)return;
    drag.distance=Math.max(drag.distance,Math.hypot(event.clientX-drag.start[0],event.clientY-drag.start[1]));
    const p=trackPoint(event.clientX,event.clientY),axis=cross(drag.p,p),s=Math.hypot(...axis),angle=Math.atan2(s,clamp(dot(drag.p,p),-1,1));
    const time=performance.now(),dt=Math.max((time-drag.time)/1000,.008);
    if(progress>.36&&s>.00001){orientation=norm(qmul(qaxis(axis.map(v=>v/s),angle),orientation));inertia={axis:axis.map(v=>v/s),speed:Math.min(angle/dt,3)};}
    else if(progress<.27)kaleidoAngle+=(event.clientX-drag.start[0])*.0003;
    drag.p=p;drag.time=time;dirty=true;setHighlight(0);wake();
  });
  function endDrag(event,cancelled=false){
    if(!drag)return;const was=drag;drag=null;input.classList.remove('is-dragging');
    if(input.hasPointerCapture(event.pointerId))input.releasePointerCapture(event.pointerId);
    if(cancelled||performance.now()-was.time>90||staticMode)inertia=null;
    if(!cancelled&&was.distance<6){const id=hit(event.clientX,event.clientY);if(id)navigate(regions[id].href);}
    dirty=true;wake();
  }
  input.addEventListener('pointerup',e=>endDrag(e));input.addEventListener('pointercancel',e=>endDrag(e,true));
  input.addEventListener('lostpointercapture',e=>{if(drag)endDrag(e,true);});
  input.addEventListener('pointerleave',()=>{pointerPosition=null;if(!drag)setHighlight(0);});
  input.addEventListener('keydown',event=>{
    const axes={ArrowLeft:[[0,1,0],-1],ArrowRight:[[0,1,0],1],ArrowUp:[[1,0,0],-1],ArrowDown:[[1,0,0],1]};
    if(event.key==='Home'){event.preventDefault();reset();return;}
    if(!axes[event.key])return;event.preventDefault();
    if(progress<.78){jump(.88);}
    const [axis,sign]=axes[event.key];orientation=norm(qmul(qaxis(axis,sign*rad(event.shiftKey?25:8)),orientation));inertia=null;pointerPosition=null;setHighlight(0);dirty=true;wake();
  });
  function navigate(href){
    const target=$(href);if(!target)return;target.setAttribute('tabindex','-1');target.focus({preventScroll:true});target.scrollIntoView({behavior:staticMode?'instant':'smooth',block:'start'});
    history.replaceState(null,'',href);inertia=null;
  }
  function jump(p){
    const target=viewPosition(p);
    if(staticMode){manualProgress=target;dirty=true;wake();return;}
    const top=opening.getBoundingClientRect().top+scrollY,distance=opening.offsetHeight-innerHeight;
    window.scrollTo({top:top+distance*target,behavior:'smooth'});wake();
  }
  function reset(){orientation=[...defaultQ];kaleidoAngle=-.12;inertia=null;pointerPosition=null;setHighlight(0);dirty=true;wake();}
  viewButtons.forEach(b=>b.addEventListener('click',()=>jump(Number(b.dataset.view))));
  document.querySelectorAll('a[href="#home"]').forEach(a=>a.addEventListener('click',()=>{if(staticMode)jump(-1);}));
  if(location.hash==='#worlds')requestAnimationFrame(()=>jump(0));
  $('.index-shortcut').addEventListener('click',()=>{if(staticMode)opening.scrollIntoView();jump(.88);});
  $('.reset-view').addEventListener('click',reset);
  $('.touch-rotate').addEventListener('click',event=>{const enabled=input.dataset.touch!=='true';input.dataset.touch=String(enabled);event.currentTarget.setAttribute('aria-pressed',String(enabled));event.currentTarget.textContent=enabled?'Finish rotating':'Enable rotation';});
  function setStatic(value){
    if(frameId){cancelAnimationFrame(frameId);frameId=0;}
    const top=opening.getBoundingClientRect().top+scrollY;
    manualProgress=rawProgress<.24?(rawProgress<.12?0:.24):rawProgress;
    staticMode=value;lastPhase='';document.body.dataset.static=String(value);
    $('.reduce-motion').setAttribute('aria-pressed',String(value));$('.reduce-motion').textContent=value?'Full motion':'Reduce motion';inertia=null;
    window.scrollTo({top:value?top:top+(opening.offsetHeight-innerHeight)*manualProgress,behavior:'instant'});
    dirty=true;wake();
  }
  $('.reduce-motion').addEventListener('click',()=>setStatic(!staticMode));reduceQuery.addEventListener('change',e=>setStatic(e.matches));
  regionLinks.forEach(a=>{
    const id=regions.findIndex(r=>r?.region===a.dataset.region);
    a.addEventListener('pointerenter',()=>{pointerPosition=null;setHighlight(id);});a.addEventListener('pointerleave',()=>setHighlight(0));
    a.addEventListener('focus',()=>setHighlight(id));a.addEventListener('blur',()=>setHighlight(0));
  });
  const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(stage);
  const visibility=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible){dirty=true;wake();}else if(frameId){cancelAnimationFrame(frameId);frameId=0;}},{rootMargin:'100px'});visibility.observe(opening);
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&frameId){cancelAnimationFrame(frameId);frameId=0;}else{dirty=true;wake();}});
  globe.addEventListener('webglcontextlost',event=>{event.preventDefault();worldReady=false;worldFailed=true;dirty=true;wake();});
  globe.addEventListener('webglcontextrestored',()=>{worldFailed=false;loadWorld();});
  window.addEventListener('pagehide',()=>{if(frameId)cancelAnimationFrame(frameId);frameId=0;inertia=null;});
  window.addEventListener('pageshow',()=>{dirty=true;wake();});
  document.body.dataset.static=String(staticMode);$('.reduce-motion').setAttribute('aria-pressed',String(staticMode));if(staticMode)$('.reduce-motion').textContent='Full motion';
  resize();loadWorld();wake();
})();
