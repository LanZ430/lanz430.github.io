'use strict';
/* Three complementary, thick spherical shells. Their geometry never morphs:
   assembly changes only each shell's rigid pose and presentation scale. */
window.PuzzleWorld = (() => {
  const TAU=Math.PI*2, rad=d=>d*Math.PI/180;
  const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
  const ease=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
  const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const norm=v=>{const l=Math.hypot(...v)||1;return v.map(x=>x/l);};
  const xyz=(lon,lat)=>[Math.cos(rad(lat))*Math.sin(rad(lon)),Math.sin(rad(lat)),Math.cos(rad(lat))*Math.cos(rad(lon))];
  const axis=(a,t)=>[...a.map(v=>v*Math.sin(t/2)),Math.cos(t/2)];
  const mul=(a,b)=>[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
  const rotate=(q,v)=>{const t=cross(q,v).map(x=>2*x),c=cross(q,t);return v.map((x,i)=>x+q[3]*t[i]+c[i]);};
  function slerp(a,b,t){let d=a.reduce((s,v,i)=>s+v*b[i],0);if(d<0){b=b.map(v=>-v);d=-d;}if(d>.999)return norm(mix(a,b,t));const r=Math.acos(clamp(d,-1,1)),s=Math.sin(r);return a.map((v,i)=>(v*Math.sin((1-t)*r)+b[i]*Math.sin(t*r))/s);}
  const palette=[[243,188,208],[169,204,232],[182,218,206]];
  const ink=[79,58,70], cream=[255,248,242];
  // The seam is a shared rounded tongue and socket, not a triangular wedge.
  function makeSeam(base,center,sign){
    const points=[];
    const add=(x,y)=>points.push([base+x*sign,y+center]);
    for(let y=-90;y<center-16;y+=2)points.push([base,y]);
    add(0,-16);add(0,-5);add(5,-5);
    const cubic=(a,b,c,d)=>{for(let j=1;j<=26;j++){const t=j/26,s=1-t;add(s*s*s*a[0]+3*s*s*t*b[0]+3*s*t*t*c[0]+t*t*t*d[0],s*s*s*a[1]+3*s*s*t*b[1]+3*s*t*t*c[1]+t*t*t*d[1]);}};
    cubic([5,-5],[8,-5],[5,-12],[15,-12]);
    cubic([15,-12],[32,-12],[32,12],[15,12]);
    cubic([15,12],[5,12],[8,5],[5,5]);
    add(0,5);add(0,16);
    for(let y=center+18;y<90;y+=2)points.push([base,y]);
    points.push([base,90]);return points;
  }
  // The front-facing join is intentionally visible in the default view.
  const seams=[makeSeam(-180,-23,1),makeSeam(-60,13,-1),makeSeam(60,-8,1)];
  const boundary=i=>i===3?seams[0].map(([x,y])=>[x+360,y]):seams[i];
  const outlines=[0,1,2].map(i=>[...boundary(i),...boundary(i+1).slice().reverse()]);
  const centers=[-120,0,120];
  const starts=[[-.66,.39,.15],[.60,.43,.12],[.03,-.55,.20]];
  const rotations=centers.map((center,i)=>mul(axis([0,0,1],rad([-18,17,-10][i])),mul(axis([1,0,0],rad([24,-24,28][i])),axis([0,1,0],rad(-center)))));
  function pose(piece,assemble,orientation){
    // Orient each shell while it is apart; only then close the radial gaps.
    // This keeps a rotating edge from sweeping through its neighbouring shell.
    const turn=ease(0,.58,assemble),join=ease(.58,1,assemble);
    const local=slerp(rotations[piece],[0,0,0,1],turn);
    const spread=xyz(centers[piece],0).map(x=>x*.43);
    const offset=rotate(orientation,mix(starts[piece],spread,turn).map(x=>x*(1-join)));
    return {q:mul(orientation,local),offset,scale:.49+.20*turn+.31*join};
  }
  function transform(point,piece,assemble,orientation){const p=pose(piece,assemble,orientation);return rotate(p.q,point).map((v,i)=>v*p.scale+p.offset[i]);}

  // Deliberately illustrative shapes. No country geometry, geographic data,
  // or accurate coastline is used. The same paths define the clickable areas.
  const lands=[
    {id:1,points:[[45,57],[65,70],[91,65],[115,72],[142,58],[162,54],[155,36],[131,29],[133,9],[110,7],[98,24],[80,9],[67,31],[45,38]]},
    {id:2,points:[[-163,60],[-141,70],[-121,63],[-99,71],[-66,57],[-63,44],[-85,28],[-89,9],[-104,23],[-118,31],[-131,49],[-155,46]]},
    {id:3,points:[[-12,48],[-4,60],[13,62],[23,73],[36,65],[37,53],[49,45],[29,37],[16,44],[4,39]]},
    {id:4,points:[[-82,9],[-64,13],[-50,4],[-35,-6],[-45,-24],[-54,-31],[-65,-57],[-75,-44],[-72,-25],[-82,-10]]},
    {id:5,points:[[-17,26],[0,35],[24,30],[34,17],[46,6],[34,-6],[29,-25],[17,-35],[5,-22],[0,-4],[-15,3]]},
    {id:6,points:[[112,-22],[124,-15],[133,-10],[147,-18],[156,-32],[144,-40],[130,-33],[116,-35]]}
  ];
  const mapW=2048,mapH=1024;
  function path(c,points,shift=0,rounded=false){
    const p=points.map(([lon,lat])=>[(lon+180+shift)/360*mapW,(90-lat)/180*mapH]);c.beginPath();
    if(rounded){const last=p.at(-1);c.moveTo((last[0]+p[0][0])/2,(last[1]+p[0][1])/2);p.forEach((v,i)=>{const next=p[(i+1)%p.length];c.quadraticCurveTo(v[0],v[1],(v[0]+next[0])/2,(v[1]+next[1])/2);});}
    else p.forEach((v,i)=>i?c.lineTo(...v):c.moveTo(...v));c.closePath();
  }
  function mapData(){
    const make=()=>{const c=document.createElement('canvas');c.width=mapW;c.height=mapH;return c;};
    const texture=make(),pieces=make(),regions=make(),lines=make();
    const pc=pieces.getContext('2d'),rc=regions.getContext('2d'),lc=lines.getContext('2d');
    pc.fillStyle='rgb(64,0,0)';pc.fillRect(0,0,mapW,mapH);
    outlines.forEach((outline,i)=>{for(const shift of [-360,0,360]){path(pc,outline,shift);pc.fillStyle=`rgb(${(i+1)*64},0,0)`;pc.fill();}});
    lc.lineJoin='round';lc.lineCap='round';lc.strokeStyle='white';lc.lineWidth=6;
    lands.forEach(land=>{path(rc,land.points,0,true);rc.fillStyle=`rgb(${land.id*32},0,0)`;rc.fill();path(lc,land.points,0,true);lc.stroke();});
    lc.lineWidth=9;
    seams.forEach(points=>{for(const shift of [-360,0,360]){lc.beginPath();points.forEach(([lon,lat],i)=>{const x=(lon+180+shift)/360*mapW,y=(90-lat)/180*mapH;i?lc.lineTo(x,y):lc.moveTo(x,y);});lc.stroke();}});
    const p=pc.getImageData(0,0,mapW,mapH).data,r=rc.getImageData(0,0,mapW,mapH).data,l=lc.getImageData(0,0,mapW,mapH).data;
    const tc=texture.getContext('2d'),out=tc.createImageData(mapW,mapH);
    for(let i=0;i<out.data.length;i+=4){out.data[i]=r[i];out.data[i+1]=l[i+3];out.data[i+2]=p[i];out.data[i+3]=255;}
    tc.putImageData(out,0,0);return {texture,pixels:out.data};
  }
  let data=null;
  function sample(v){
    const x=clamp(Math.floor((Math.atan2(v[0],v[2])/TAU+.5)*mapW),0,mapW-1),y=clamp(Math.floor((.5-Math.asin(clamp(v[1],-1,1))/Math.PI)*mapH),0,mapH-1);
    const i=(y*mapW+x)*4;return [Math.round(data.pixels[i]/32),data.pixels[i+1]/255,Math.round(data.pixels[i+2]/64)-1];
  }
  function surfaceMesh(){
    const out=[];
    const vertex=(u,v)=>{const p=xyz(u*360-180,90-v*180);out.push(...p,...p,u,v);};
    for(let y=0;y<64;y++)for(let x=0;x<128;x++){
      const u=x/128,v=y/64,U=(x+1)/128,V=(y+1)/64;
      // UV v points downward, so reverse its winding for the outward shell.
      vertex(u,v);vertex(U,V);vertex(U,v);vertex(u,v);vertex(u,V);vertex(U,V);
    }return new Float32Array(out);
  }
  function wallMesh(piece){
    const out=[],outline=outlines[piece];
    const push=(p,n)=>out.push(...p,...n,0,0);
    for(let i=0;i<outline.length;i++){
      const a=xyz(...outline[i]),b=xyz(...outline[(i+1)%outline.length]),c=b.map(x=>x*.88),d=a.map(x=>x*.88);
      const normal=norm(cross(b.map((x,j)=>x-a[j]),d.map((x,j)=>x-a[j])));
      for(const p of [a,b,c,a,c,d])push(p,normal);
    }return new Float32Array(out);
  }
  function edgeMesh(piece){
    const out=[],points=outlines[piece].map(p=>xyz(...p));
    for(const shell of [1,.88]){
      const rings=points.map((p,i)=>{
        const previous=points[(i+points.length-1)%points.length],next=points[(i+1)%points.length];
        const tangent=norm(next.map((v,j)=>v-previous[j])),side=norm(cross(tangent,p));
        return Array.from({length:8},(_,j)=>{const n=norm(p.map((v,k)=>v*Math.cos(j*TAU/8)+side[k]*Math.sin(j*TAU/8)));return {p:p.map((v,k)=>v*shell+n[k]*.0065),n};});
      });
      const push=v=>out.push(...v.p,...v.n,0,0);
      rings.forEach((ring,i)=>{const next=rings[(i+1)%rings.length];ring.forEach((a,j)=>{const b=ring[(j+1)%8],c=next[(j+1)%8],d=next[j];[a,b,c,a,c,d].forEach(push);});});
    }return new Float32Array(out);
  }
  const vertex=`attribute vec3 aPosition;attribute vec3 aNormal;attribute vec2 aUv;
uniform mat3 uRotation;uniform vec3 uOffset;uniform vec2 uProjection;uniform float uScale;uniform float uInner;
varying vec2 vUv;varying vec3 vNormal;
void main(){vec3 p=uRotation*aPosition*uScale*uInner+uOffset;gl_Position=vec4(p.xy*uProjection,-p.z*.25,1.);vUv=aUv;vNormal=uRotation*aNormal;}`;
  const fragment=`precision highp float;varying vec2 vUv;varying vec3 vNormal;
uniform sampler2D uMap;uniform float uPiece;uniform float uInner;uniform float uWall;uniform float uHighlight;uniform vec3 uColor;
void main(){vec4 m=texture2D(uMap,vUv);float id=floor(m.r*255./32.+.5);float piece=floor(m.b*255./64.+.5)-1.;
if(uWall<.5 && abs(piece-uPiece)>.1)discard;
vec3 ink=vec3(.3098,.22745,.27451),paper=vec3(1.,.97255,.94902);vec3 n=normalize(vNormal);
vec3 color=uColor;float line=m.g;
if(uWall>.5){color=mix(ink,uColor,.63);line=0.;}
else if(uInner<.95){color=mix(ink,uColor,.58);line*=.6;n=-n;}
else if(id>.5){color=mix(uColor,paper,.84);if(abs(id-uHighlight)<.1)color=mix(uColor,paper,.18);}
float light=clamp(dot(n,normalize(vec3(-.6,.85,1.7))),0.,1.);
color=mix(ink,color,.85+.15*light);
if(uWall<.5&&uInner>.95){float rim=1.-smoothstep(.075,.16,abs(n.z));line=max(line,rim);}
if(uWall>1.5)line=1.;
color=mix(color,ink,line);gl_FragColor=vec4(color,1.);}`;
  function gpu(canvas){
    const gl=canvas.getContext('webgl',{alpha:true,antialias:true,preserveDrawingBuffer:true});if(!gl)return null;
    const shaders=[];
    const compile=(type,src)=>{const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));shaders.push(s);return s;};
    const program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
    const attrib=['aPosition','aNormal','aUv'].map(n=>gl.getAttribLocation(program,n));
    const uniforms=Object.fromEntries(['uRotation','uOffset','uProjection','uScale','uInner','uMap','uPiece','uWall','uColor','uHighlight'].map(n=>[n,gl.getUniformLocation(program,n)]));
    const buffers=[];
    const mesh=vertices=>{const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.STATIC_DRAW);buffers.push(buffer);return {buffer,count:vertices.length/8};};
    const sphere=mesh(surfaceMesh()),walls=[0,1,2].map(i=>mesh(wallMesh(i))),edges=[0,1,2].map(i=>mesh(edgeMesh(i)));
    const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,data.texture);gl.uniform1i(uniforms.uMap,0);
    function drawMesh(m){gl.bindBuffer(gl.ARRAY_BUFFER,m.buffer);attrib.forEach((a,i)=>{gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,i===2?2:3,gl.FLOAT,false,32,[0,12,24][i]);});gl.drawArrays(gl.TRIANGLES,0,m.count);}
    return {type:'webgl-puzzle',resize(){gl.viewport(0,0,canvas.width,canvas.height);},draw({orientation,assemble,highlight,w,h,radius}){
      gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.useProgram(program);gl.uniform2f(uniforms.uProjection,radius/(w/2),radius/(h/2));gl.uniform1f(uniforms.uHighlight,highlight);
      for(let i=0;i<3;i++){
        const p=pose(i,assemble,orientation);gl.uniformMatrix3fv(uniforms.uRotation,false,new Float32Array([...rotate(p.q,[1,0,0]),...rotate(p.q,[0,1,0]),...rotate(p.q,[0,0,1])]));gl.uniform3fv(uniforms.uOffset,p.offset);gl.uniform1f(uniforms.uScale,p.scale);gl.uniform1f(uniforms.uPiece,i);gl.uniform3fv(uniforms.uColor,palette[i].map(v=>v/255));
        gl.enable(gl.CULL_FACE);gl.cullFace(gl.FRONT);gl.uniform1f(uniforms.uInner,.88);gl.uniform1f(uniforms.uWall,0);drawMesh(sphere);
        gl.cullFace(gl.BACK);gl.uniform1f(uniforms.uInner,1);drawMesh(sphere);
        gl.disable(gl.CULL_FACE);gl.uniform1f(uniforms.uWall,1);drawMesh(walls[i]);
        gl.uniform1f(uniforms.uWall,2);drawMesh(edges[i]);
      }
    },dispose(){buffers.forEach(b=>gl.deleteBuffer(b));shaders.forEach(s=>gl.deleteShader(s));gl.deleteTexture(texture);gl.deleteProgram(program);}};
  }
  // Lower-detail fallback retains the curved pieces and interactive globe.
  // It intersects inner/outer surfaces; sidewalls and edge tubes are GPU-only.
  function fallback(original){
    const canvas=document.createElement('canvas');canvas.id='globe';canvas.setAttribute('aria-hidden','true');original.replaceWith(canvas);
    const ctx=canvas.getContext('2d'),buffer=document.createElement('canvas');
    const inverse=q=>[-q[0],-q[1],-q[2],q[3]];
    return {type:'canvas-puzzle',canvas,resize(){},draw({orientation,assemble,highlight,w,h,radius,dpr}){
      canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
      const scale=Math.min(1,480/w),W=buffer.width=Math.round(w*scale),H=buffer.height=Math.round(h*scale),bc=buffer.getContext('2d'),im=bc.createImageData(W,H),depth=new Float32Array(W*H).fill(-100);
      for(let piece=0;piece<3;piece++){
        const p=pose(piece,assemble,orientation),q=inverse(p.q);
        for(let y=0;y<H;y++)for(let x=0;x<W;x++){
          const nx=((x+.5)/scale-w/2)/radius-p.offset[0],ny=(h/2-(y+.5)/scale)/radius-p.offset[1],r2=(nx*nx+ny*ny)/(p.scale*p.scale);if(r2>1)continue;
          for(const inner of [1,.88])for(const sign of [1,-1]){
            if(r2>inner*inner)continue;
            const nz=Math.sqrt(inner*inner-r2)*sign,local=rotate(q,[nx/p.scale/inner,ny/p.scale/inner,nz/inner]),m=sample(local),z=nz*p.scale+p.offset[2],k=y*W+x;
            if(m[2]!==piece||z<=depth[k])continue;depth[k]=z;
            let c=inner===1?(m[0]?mix(palette[piece],cream,m[0]===highlight?.18:.84):palette[piece]):mix(ink,palette[piece],.58);
            c=mix(ink,c,.85+.15*clamp((-nx/p.scale*.6+ny/p.scale*.85+nz*1.7)/2));
            c=mix(c,ink,Math.max(m[1],inner===1&&Math.abs(nz)<.1?1:0));for(let j=0;j<3;j++)im.data[k*4+j]=c[j];im.data[k*4+3]=255;
          }
        }
      }
      bc.putImageData(im,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(buffer,0,0,canvas.width,canvas.height);
    },dispose(){}};
  }
  function create(canvas){data??=mapData();let result;try{result=gpu(canvas);}catch(e){console.warn('Puzzle WebGL unavailable:',e.message);}return result||fallback(canvas);}
  function facet(piece,index,total,orientation){
    const rows=8,cols=Math.ceil(total/rows),row=index%rows,col=Math.floor(index/rows);
    const lon=centers[piece]-43+(col+.5)/cols*86,lat=-62+(row+.5)/rows*124;
    return [[lon-8,lat-8],[lon+8,lat-7],[lon,lat+9]].map(p=>transform(xyz(...p),piece,0,orientation));
  }
  return {create,sampleRegion:v=>sample(v)[0],facet,pose,transform};
})();
