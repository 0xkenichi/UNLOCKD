import{r as e,j as t}from"./index-2NPzJd7q.js";import{R as A,a as d,u as p,A as C,V as w,S as E,b as z,C as F}from"./react-three-fiber.esm-DtiHgbIN.js";const P=()=>parseInt(A.replace(/\D+/g,"")),_=P();class R extends z{constructor(){super({uniforms:{time:{value:0},fade:{value:1}},vertexShader:`
      uniform float time;
      attribute float size;
      varying vec3 vColor;
      void main() {
        vColor = color;
        vec4 mvPosition = modelViewMatrix * vec4(position, 0.5);
        gl_PointSize = size * (30.0 / -mvPosition.z) * (3.0 + sin(time + 100.0));
        gl_Position = projectionMatrix * mvPosition;
      }`,fragmentShader:`
      uniform sampler2D pointTexture;
      uniform float fade;
      varying vec3 vColor;
      void main() {
        float opacity = 1.0;
        if (fade == 1.0) {
          float d = distance(gl_PointCoord, vec2(0.5, 0.5));
          opacity = 1.0 / (1.0 + exp(16.0 * (d - 0.25)));
        }
        gl_FragColor = vec4(vColor, opacity);

        #include <tonemapping_fragment>
	      #include <${_>=154?"colorspace_fragment":"encodings_fragment"}>
      }`})}}const V=a=>new w().setFromSpherical(new E(a,Math.acos(1-Math.random()*2),Math.random()*2*Math.PI)),I=e.forwardRef(({radius:a=100,depth:i=50,count:n=5e3,saturation:o=0,factor:r=4,fade:h=!1,speed:g=1},v)=>{const l=e.useRef(),[x,b,y]=e.useMemo(()=>{const s=[],u=[],j=Array.from({length:n},()=>(.5+.5*Math.random())*r),c=new d;let f=a+i;const S=i/n;for(let m=0;m<n;m++)f-=S*Math.random(),s.push(...V(f).toArray()),c.setHSL(m/n,o,.9),u.push(c.r,c.g,c.b);return[new Float32Array(s),new Float32Array(u),new Float32Array(j)]},[n,i,r,a,o]);p(s=>l.current&&(l.current.uniforms.time.value=s.clock.getElapsedTime()*g));const[M]=e.useState(()=>new R);return e.createElement("points",{ref:v},e.createElement("bufferGeometry",null,e.createElement("bufferAttribute",{attach:"attributes-position",args:[x,3]}),e.createElement("bufferAttribute",{attach:"attributes-color",args:[b,3]}),e.createElement("bufferAttribute",{attach:"attributes-size",args:[y,1]})),e.createElement("primitive",{ref:l,object:M,attach:"material",blending:C,"uniforms-fade-value":h,depthWrite:!1,transparent:!0,vertexColors:!0}))});function L({count:a=800}){const i=e.useRef(),n=e.useMemo(()=>{const o=new Float32Array(a*3);for(let r=0;r<a;r+=1)o[r*3]=(Math.random()-.5)*12,o[r*3+1]=(Math.random()-.5)*6,o[r*3+2]=(Math.random()-.5)*8;return o},[a]);return p(({clock:o})=>{const r=o.getElapsedTime();i.current&&(i.current.rotation.y=r*.05,i.current.rotation.x=r*.03)}),t.jsxs("points",{ref:i,children:[t.jsx("bufferGeometry",{children:t.jsx("bufferAttribute",{attach:"attributes-position",count:n.length/3,array:n,itemSize:3})}),t.jsx("pointsMaterial",{color:new d("#c0c0c0"),size:.05,sizeAttenuation:!0,opacity:.6,transparent:!0})]})}function D(){return t.jsxs(F,{children:[t.jsx("ambientLight",{intensity:.6}),t.jsx("pointLight",{position:[2,3,4],intensity:.9}),t.jsx(I,{radius:40,depth:20,count:2e3,factor:2,fade:!0}),t.jsx(L,{}),t.jsxs("mesh",{children:[t.jsx("sphereGeometry",{args:[1.5,48,48]}),t.jsx("meshStandardMaterial",{color:"#C0C0C0",emissive:"#123056"})]})]})}export{D as default};
