'use strict';
(() => {
  // A tiny, independent physics layer. No background canvas catches scrolling,
  // and no main-art render is triggered by a moving decorative object.
  const pinned=document.querySelector('.atlas-pinned'),layer=document.querySelector('.ambient-layer');
  const stage=document.querySelector('.atlas-art'),toggle=document.querySelector('.ambient-toggle');
  const palette=['#F3BCD0','#A9CCE8','#B6DACE'],ink='#4F3A46',paper='#FFF8F2';
  const reduce=matchMedia('(prefers-reduced-motion: reduce)');
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const params=new URLSearchParams(location.search);
  let enabled=params.get('ambience')!=='off',staticMode=false,visible=true,frame=0,last=0,time=0;
  let width=0,height=0,rect={left:0,top:0},safeRects=[],circle=null,phase='',drag=null,pointer=null,layoutDirty=true;
  const seeds=[[.10,.16],[.43,.14],[.87,.14],[.965,.55],[.62,.835],[.30,.80],[.075,.73]];
  const mobileSeeds=[[.88,.10],[.10,.405],[.93,.82],[.14,.84]];
  layer.id='ambient-shapes';
  const toys=seeds.map((seed,i)=>{
    const button=document.createElement('button');button.type='button';button.className='ambient-toy';button.dataset.toy=String(i);button.setAttribute('aria-describedby','ambient-help');button.setAttribute('aria-pressed','false');
    const canvas=document.createElement('canvas');canvas.width=canvas.height=88;canvas.setAttribute('aria-hidden','true');button.append(canvas);layer.append(button);
    return {button,canvas,seed,i,x:0,y:0,vx:0,vy:0,angle:i*.57,paused:false,focused:false,hovered:false,available:true};
  });
  function paint(toy){
    const c=toy.canvas.getContext('2d');c.setTransform(2,0,0,2,44,44);c.clearRect(-22,-22,44,44);
    c.lineWidth=1.35;c.lineJoin='round';c.lineCap='round';c.strokeStyle=ink;c.fillStyle=palette[toy.i%3];
    if(phase==='fragments'){
      const points=toy.i%3===0?[[-10,-9],[11,-5],[6,11],[-11,5]]:toy.i%3===1?[[-11,8],[-4,-12],[12,4]]:[[-12,-3],[-1,-11],[12,1],[4,10],[-7,8]];
      c.beginPath();points.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.closePath();c.fill();c.stroke();
    }else if(toy.i%3===0){
      // A small ringed world; far and near ring arcs establish depth.
      c.rotate(-.38);c.beginPath();c.ellipse(0,0,17,5.7,0,Math.PI,Math.PI*2);c.stroke();
      c.beginPath();c.arc(0,0,9.8,0,Math.PI*2);c.fill();c.stroke();
      c.beginPath();c.ellipse(0,0,17,5.7,0,0,Math.PI);c.stroke();
      c.fillStyle=paper;c.beginPath();c.arc(-3.5,-3.5,1.7,0,Math.PI*2);c.fill();
    }else if(toy.i%3===1){
      c.rotate(.3);c.beginPath();c.ellipse(0,0,17,6.5,0,0,Math.PI*2);c.fill();c.stroke();
      c.beginPath();c.ellipse(0,0,10.5,3.6,0,0,Math.PI*2);c.stroke();c.fillStyle=paper;c.beginPath();c.arc(0,0,3.2,0,Math.PI*2);c.fill();c.stroke();
    }else{
      c.beginPath();c.arc(0,0,11.5,0,Math.PI*2);c.fill();c.stroke();
      c.fillStyle=paper;c.beginPath();c.moveTo(-8,-5);c.quadraticCurveTo(-2,-11,3,-6);c.quadraticCurveTo(10,-2,4,2);c.quadraticCurveTo(0,7,-3,2);c.quadraticCurveTo(-9,1,-8,-5);c.fill();c.stroke();
      c.beginPath();c.arc(5,6,2,0,Math.PI*2);c.fill();c.stroke();
    }
    toy.button.setAttribute('aria-label',`Floating ${phase==='fragments'?'fragment':toy.i%3===1?'galaxy':'planet'} ${toy.i+1}`);
    toy.button.title='Drag to move; brush past to nudge';
  }
  function isSafe(x,y,pad=24){
    if(x<pad||x>width-pad||y<80+pad||y>height-pad)return false;
    if(safeRects.some(r=>x>r.left-pad&&x<r.right+pad&&y>r.top-pad&&y<r.bottom+pad))return false;
    return !circle||Math.hypot(x-circle.x,y-circle.y)>circle.radius+pad;
  }
  function findFree(x,y,toy,initial=false){
    if(isSafe(x,y)&&(!initial||!toys.some(t=>t!==toy&&t.available&&Math.hypot(t.x-x,t.y-y)<62)))return [x,y];
    let best=null,cost=Infinity;
    for(let Y=108;Y<height-42;Y+=20)for(let X=28;X<width-24;X+=20){
      if(!isSafe(X,Y))continue;
      const crowd=toys.some(t=>t!==toy&&t.available&&Math.hypot(t.x-X,t.y-Y)<58);
      if(initial&&crowd)continue;
      const d=(X-x)**2+(Y-y)**2+(crowd?10000:0);if(d<cost){cost=d;best=[X,Y];}
    }return best;
  }
  function updateLayout(reset=false){
    rect=pinned.getBoundingClientRect();const prevWidth=width,prevHeight=height;width=rect.width;height=rect.height;
    const local=el=>{const r=el.getBoundingClientRect();return {left:r.left-rect.left,right:r.right-rect.left,top:r.top-rect.top,bottom:r.bottom-rect.top};};
    // Reserve the union of the three copy panels so phase changes don't send
    // little objects jumping across the page or through a headline.
    safeRects=[...pinned.querySelectorAll('.atlas-copy'),pinned.querySelector('.atlas-controls')].map(local);
    const a=local(stage),r=Math.min((a.right-a.left)*.405,(a.bottom-a.top)*.435);
    circle={x:(a.left+a.right)/2,y:(a.top+a.bottom)/2,radius:r*1.16};
    const mobile=width<768,count=mobile?4:7;
    toys.forEach(t=>{t.available=false;t.button.hidden=true;});
    toys.slice(0,count).forEach(toy=>{
      const s=mobile?mobileSeeds[toy.i]:toy.seed;
      const target=reset||!prevWidth?[s[0]*width,s[1]*height]:[toy.x/prevWidth*width,toy.y/prevHeight*height];
      const point=findFree(...target,toy,true);toy.available=!!point;toy.button.hidden=!point;
      if(point){[toy.x,toy.y]=point;toy.vx=toy.vy=0;render(toy);}
    });
    layer.dataset.count=String(toys.filter(t=>t.available).length);layoutDirty=false;
  }
  function render(toy){toy.button.style.transform=`translate3d(${(toy.x-22).toFixed(2)}px,${(toy.y-22).toFixed(2)}px,0) rotate(${toy.angle.toFixed(4)}rad)`;}
  function finish(cancelled=false){
    if(!drag)return;const d=drag;drag=null;d.toy.button.dataset.dragging='false';
    if(d.toy.button.hasPointerCapture(d.id))d.toy.button.releasePointerCapture(d.id);
    if(cancelled||staticMode||performance.now()-d.time>110)d.toy.vx=d.toy.vy=0;
    pointer=null;wake();
  }
  function step(now){
    frame=0;if(!enabled||!visible||document.hidden)return;
    const dt=Math.min((now-last)/1000||.016,.04);last=now;
    if(layoutDirty)updateLayout();
    if(!staticMode)time+=dt;
    toys.forEach(toy=>{
      if(!toy.available||drag?.toy===toy||toy.focused||toy.paused||staticMode)return;
      const driftX=Math.sin(time*.22+toy.i*2.3)*6,driftY=3+Math.cos(time*.17+toy.i*1.7)*4;
      toy.vx+=(driftX-toy.vx)*dt*.65;toy.vy+=(driftY-toy.vy)*dt*.65;
      if(pointer&&!toy.hovered&&!drag&&now-pointer.time<180){
        const dx=toy.x-pointer.x,dy=toy.y-pointer.y,d=Math.hypot(dx,dy),reach=78;
        if(d>2&&d<reach){const f=(1-d/reach)*420*dt;toy.vx+=dx/d*f;toy.vy+=dy/d*f;}
      }
      const speed=Math.hypot(toy.vx,toy.vy);if(speed>100){toy.vx*=100/speed;toy.vy*=100/speed;}
      const x=toy.x+toy.vx*dt,y=toy.y+toy.vy*dt;
      if(isSafe(x,y)){toy.x=x;toy.y=y;}else{
        if(isSafe(x,toy.y))toy.x=x;else toy.vx*=-.8;
        if(isSafe(toy.x,y))toy.y=y;else toy.vy*=-.8;
      }
      // Soft separation keeps the background sparse, even after a playful toss.
      toys.forEach(other=>{if(other===toy||!other.available)return;const dx=toy.x-other.x,dy=toy.y-other.y,d=Math.hypot(dx,dy);if(d>0&&d<54){toy.vx+=dx/d*(54-d)*dt;toy.vy+=dy/d*(54-d)*dt;}});
      toy.angle+=dt*(.018+toy.i*.002);render(toy);
    });
    if(!staticMode)frame=requestAnimationFrame(step);
  }
  function wake(){if(!frame&&enabled&&visible&&!document.hidden){last=performance.now();frame=requestAnimationFrame(step);}}
  function sync(){
    const next=stage.dataset.phase||'fragments';if(next!==phase){phase=next;toys.forEach(paint);layer.dataset.phase=phase;}
    // The main controller handles OS preferences and explicit user overrides.
    staticMode=document.body.dataset.static==='true';
    layer.dataset.static=String(staticMode);
    if(staticMode){toys.forEach(t=>t.vx=t.vy=0);if(frame)cancelAnimationFrame(frame);frame=0;}
    layoutDirty=true;wake();
  }
  toys.forEach(toy=>{
    const b=toy.button;
    b.addEventListener('pointerenter',()=>toy.hovered=true);b.addEventListener('pointerleave',()=>toy.hovered=false);
    b.addEventListener('pointerdown',e=>{
      if(e.button!==0||drag)return;rect=pinned.getBoundingClientRect();drag={toy,id:e.pointerId,dx:toy.x-(e.clientX-rect.left),dy:toy.y-(e.clientY-rect.top),time:performance.now()};
      toy.vx=toy.vy=0;toy.paused=false;b.setAttribute('aria-pressed','false');b.dataset.dragging='true';b.setPointerCapture(e.pointerId);e.preventDefault();e.stopPropagation();
    });
    b.addEventListener('pointermove',e=>{
      if(drag?.toy!==toy||drag.id!==e.pointerId)return;
      const x=e.clientX-rect.left+drag.dx,y=e.clientY-rect.top+drag.dy,point=findFree(x,y,toy);
      if(point){const now=performance.now(),dt=Math.max((now-drag.time)/1000,.016);toy.vx=clamp((point[0]-toy.x)/dt,-90,90);toy.vy=clamp((point[1]-toy.y)/dt,-90,90);[toy.x,toy.y]=point;drag.time=now;render(toy);}e.stopPropagation();
    });
    b.addEventListener('pointerup',e=>{if(drag?.id===e.pointerId)finish();});
    b.addEventListener('pointercancel',()=>finish(true));b.addEventListener('lostpointercapture',()=>{if(drag?.toy===toy)finish(true);});
    b.addEventListener('focus',()=>{toy.focused=true;toy.vx=toy.vy=0;});b.addEventListener('blur',()=>{toy.focused=false;wake();});
    b.addEventListener('click',e=>{if(e.detail===0){toy.paused=!toy.paused;b.setAttribute('aria-pressed',String(toy.paused));}});
    b.addEventListener('keydown',e=>{
      const delta={ArrowLeft:[-14,0],ArrowRight:[14,0],ArrowUp:[0,-14],ArrowDown:[0,14]}[e.key];if(!delta)return;e.preventDefault();
      const point=findFree(toy.x+delta[0],toy.y+delta[1],toy);if(point){[toy.x,toy.y]=point;render(toy);}
    });
  });
  pinned.addEventListener('pointermove',e=>{if(!enabled||staticMode||drag)return;rect=pinned.getBoundingClientRect();pointer={x:e.clientX-rect.left,y:e.clientY-rect.top,time:performance.now()};},{passive:true});
  pinned.addEventListener('pointerleave',()=>pointer=null);
  function setEnabled(value){
    if(!value)finish(true);enabled=value;layer.hidden=!value;layer.inert=!value;toggle.setAttribute('aria-pressed',String(value));toggle.textContent=value?'Background on':'Background off';
    pinned.dataset.ambience=value?'on':'off';if(!value&&frame){cancelAnimationFrame(frame);frame=0;}else wake();
  }
  toggle.addEventListener('click',()=>{
    setEnabled(!enabled);const url=new URL(location.href);url.searchParams.set('ambience',enabled?'on':'off');history.replaceState(null,'',url);
  });
  new MutationObserver(sync).observe(stage,{attributes:true,attributeFilter:['data-phase']});
  new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['data-static']});
  new ResizeObserver(()=>{layoutDirty=true;wake();}).observe(pinned);
  new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(!visible){finish(true);if(frame)cancelAnimationFrame(frame);frame=0;}else{layoutDirty=true;wake();}}).observe(pinned);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){finish(true);if(frame)cancelAnimationFrame(frame);frame=0;}else wake();});
  window.addEventListener('pagehide',()=>{finish(true);if(frame)cancelAnimationFrame(frame);frame=0;});
  window.addEventListener('pageshow',wake);reduce.addEventListener('change',sync);
  document.fonts.ready.then(()=>{layoutDirty=true;wake();});
  sync();updateLayout(true);setEnabled(enabled);
})();
