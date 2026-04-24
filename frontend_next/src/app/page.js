"use client";
import { useState, useEffect, useRef, useMemo } from 'react';
import { Send, Loader2, Plus, Pencil, Trash2, X, ChevronLeft, ChevronRight, BookOpen, BarChart3, Database, Camera, LogOut } from 'lucide-react';
import {
  Chart as ChartJS, ArcElement, Tooltip, Legend,
  CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title,
} from 'chart.js';
import { Pie, Bar, Line } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title);

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://192.168.11.10:8000/api';
const EXPENSE_CATS = ['食費','日用品','交通費','趣味・娯楽','交際費','被服・美容','住居費','水道・光熱費','医療費','その他'];
const INCOME_CATS  = ['給与','ボーナス','副業','投資','贈与','その他'];
const WEEKDAYS = ['日','月','火','水','木','金','土'];
const CAT_COLORS = ['#e84a5f','#f97316','#eab308','#22c55e','#14b8a6','#3b82f6','#8b5cf6','#ec4899','#64748b','#94a3b8'];

function getMonthKey(d = new Date()) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
function today() { return new Date().toISOString().split('T')[0]; }
function fmtMonth(k){ const [y,m]=k.split('-'); return `${y}年${parseInt(m)}月`; }
function shiftMonth(k,delta){ const [y,m]=k.split('-').map(Number); const d=new Date(y,m-1+delta,1); return getMonthKey(d); }

// 日本語金額パーサー（「30万円」→300000、「5千円」→5000 など）
function parseJPAmount(text) {
  // 全角数字→半角
  const norm = text.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
  // 億: (\d+)億(\d{0,8})
  const okuMatch = norm.match(/(\d[\d,]*)億(\d{0,8})/);
  if (okuMatch) {
    const oku = parseInt(okuMatch[1].replace(/,/g,'')) * 100000000;
    const rest = okuMatch[2] ? parseInt(okuMatch[2]) : 0;
    return oku + rest;
  }
  // 万: (\d+)万(\d{0,4})
  const manMatch = norm.match(/(\d[\d,]*)万(\d{0,4})/);
  if (manMatch) {
    const man = parseInt(manMatch[1].replace(/,/g,'')) * 10000;
    const rest = manMatch[2] ? parseInt(manMatch[2]) : 0;
    return man + rest;
  }
  // 千: (\d+)千(\d{0,3})
  const senMatch = norm.match(/(\d[\d,]*)千(\d{0,3})/);
  if (senMatch) {
    const sen = parseInt(senMatch[1].replace(/,/g,'')) * 1000;
    const rest = senMatch[2] ? parseInt(senMatch[2]) : 0;
    return sen + rest;
  }
  // 通常の数字
  const num = norm.match(/\d[\d,]*/);
  return num ? parseInt(num[0].replace(/,/g,'')) : 0;
}

// 日本語金額表現をテキストから除去（店舗名抽出用）
function removeAmountExpr(text) {
  // 全角数字→半角
  const norm = text.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
  return norm
    .replace(/\d[\d,]*(億[\d,]*)?万[\d,]*(円|えん)?/g, '')
    .replace(/\d[\d,]*(千[\d,]*)?(円|えん)?/g, '')
    .replace(/\d[\d,]*(円|えん)?/g, '')
    .trim();
}


const KW_EXPENSE = {
  '食費':['コーヒー','ランチ','ラーメン','寿司','カフェ','弁当','コンビニ','スーパー','マクドナルド','スタバ','吉野家','お菓子','アイス','アップルパイ','ピザ'],
  '交通費':['電車','バス','タクシー','定期','高速','ガソリン','地下鉄','新幹線'],
  '趣味・娯楽':['ゲーム','映画','漫画','本','旅行','Netflix','Spotify','フィギュア'],
  '交際費':['プレゼント','ギフト','飲み会','お祝い'],
  '被服・美容':['服','靴','バッグ','コスメ','美容院'],
  '日用品':['シャンプー','洗剤','ティッシュ','マスク'],
  '医療費':['病院','薬局','薬','クリニック'],
};
const KW_INCOME = {
  '給与':['給料','給与','月給'],'ボーナス':['ボーナス','賞与'],
  '副業':['バイト','副業','フリーランス','メルカリ'],'投資':['配当','株','FX','利息'],'贈与':['お小遣い','仕送り'],
};
function guessEC(t){ for(const [c,ks] of Object.entries(KW_EXPENSE)) if(ks.some(k=>t.includes(k))) return c; return 'その他'; }
function guessIC(t){ for(const [c,ks] of Object.entries(KW_INCOME)) if(ks.some(k=>t.includes(k))) return c; return 'その他'; }

// ── 小コンポーネント ──
function ModalSheet({title,onClose,children}){
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal-sheet" onClick={e=>e.stopPropagation()}>
        <div className="modal-handle"/>
        <div className="modal-title">{title}</div>
        {children}
      </div>
    </div>
  );
}
function Field({label,children}){
  return <div style={{marginBottom:'14px'}}><label className="field-label">{label}</label>{children}</div>;
}

// ── メイン ──
export default function Home(){
  const [mounted,setMounted]   = useState(false);
  const [token,setToken]       = useState(null);
  const [tab,setTab]           = useState('home');
  const [loading,setLoading]   = useState(false);
  const [initErr,setInitErr]   = useState('');

  const [authMode,setAuthMode] = useState('login');
  const [email,setEmail]       = useState('');
  const [password,setPwd]      = useState('');
  const [confirmPassword,setConfirmPassword] = useState('');
  const [dob,setDob]           = useState('');
  const [authErr,setAuthErr]   = useState('');

  const age = useMemo(() => {
    if(!dob) return '';
    const birthDate = new Date(dob);
    const todayDate = new Date();
    let computedAge = todayDate.getFullYear() - birthDate.getFullYear();
    const m = todayDate.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && todayDate.getDate() < birthDate.getDate())) computedAge--;
    return computedAge;
  }, [dob]);

  const [expenses,setExpenses] = useState([]);
  const [incomes, setIncomes]  = useState([]);
  const [assets,  setAssets]   = useState([]);

  const [month,setMonth] = useState(getMonthKey());

  const [inputMode,setInputMode] = useState('expense');
  const [inputText,setInputText] = useState('');
  const [submitting,setSubmitting] = useState(false);
  const fileRef = useRef(null);

  const [editTx,    setEditTx]    = useState(null);
  const [editAsset, setEditAsset] = useState(null);
  const [showAddAsset,setShowAddAsset] = useState(false);
  const [assetForm, setAssetForm] = useState({name:'',amount:'',note:''});

  const H = () => ({'Content-Type':'application/json','Authorization':`Bearer ${token}`});

  useEffect(()=>{ try{const t=localStorage.getItem('token');if(t)setToken(t);}catch(e){} setMounted(true); },[]);
  useEffect(()=>{ if(mounted&&token) fetchAll(); },[mounted,token]);

  async function fetchAll(){
    setLoading(true);
    try{
      const [eR,iR,aR] = await Promise.all([
        fetch(`${API_BASE}/expenses`,{headers:H()}),
        fetch(`${API_BASE}/incomes`, {headers:H()}),
        fetch(`${API_BASE}/assets`,  {headers:H()}),
      ]);
      if([eR,iR,aR].some(r=>r.status===401)){handleLogout();return;}
      if(eR.ok) setExpenses(await eR.json());
      if(iR.ok) setIncomes(await iR.json());
      if(aR.ok) setAssets(await aR.json());
    }catch(e){setInitErr('接続エラー');}
    setLoading(false);
  }

  async function handleAuth(e){
    e.preventDefault(); setAuthErr('');
    if(authMode==='register' && password !== confirmPassword){
      setAuthErr('パスワードが一致しません');
      return;
    }
    try{
      let body,headers={};
      if(authMode==='login'){
        const fd=new URLSearchParams(); fd.append('username',email); fd.append('password',password);
        body=fd; headers['Content-Type']='application/x-www-form-urlencoded';
      } else { 
        headers['Content-Type']='application/json'; 
        body=JSON.stringify({email,password,dob:dob||null,age:age===''?null:age}); 
      }
      const res=await fetch(`${API_BASE}/${authMode==='login'?'login':'register'}`,{method:'POST',headers,body});
      const d=await res.json();
      if(res.ok&&d.access_token){
        localStorage.setItem('token',d.access_token);
        setToken(d.access_token);
        // Reset form
        setEmail('');setPwd('');setConfirmPassword('');setDob('');
      } else setAuthErr(d.detail||'エラー');
    }catch(e){setAuthErr('接続エラー');}
  }

  function handleLogout(){localStorage.removeItem('token');setToken(null);setExpenses([]);setIncomes([]);setAssets([]);}

  async function handleSubmit(){
    if(!inputText.trim()) return;
    setSubmitting(true);
    const amount = parseJPAmount(inputText);
    if(!amount){setSubmitting(false);alert('金額を含めてください');return;}
    if(inputMode==='expense'){
      try{
        const r=await fetch(`${API_BASE}/analyze-text`,{method:'POST',headers:H(),body:JSON.stringify({text:inputText})});
        if(r.ok){setInputText('');await fetchAll();setSubmitting(false);return;}
      }catch(e){}
      const store=removeAmountExpr(inputText)||'手動入力';
      await fetch(`${API_BASE}/expenses`,{method:'POST',headers:H(),body:JSON.stringify({date:today(),amount,store,category:guessEC(inputText)})});
    } else {
      const source=removeAmountExpr(inputText).replace(/もらった|受け取った/g,'').trim()||'収入';
      await fetch(`${API_BASE}/incomes`,{method:'POST',headers:H(),body:JSON.stringify({date:today(),amount,source,category:guessIC(inputText)})});
    }
    setInputText('');await fetchAll();setSubmitting(false);
  }


  async function handleImageUpload(e){
    const file=e.target.files[0]; if(!file) return;
    setSubmitting(true);
    const fd=new FormData(); fd.append('file',file);
    try{
      const r=await fetch(`${API_BASE}/upload`,{method:'POST',headers:{Authorization:`Bearer ${token}`},body:fd});
      if(r.ok){const {data}=await r.json();await fetch(`${API_BASE}/expenses`,{method:'POST',headers:H(),body:JSON.stringify({date:data.date||today(),amount:data.amount||0,store:data.store||'レシート',category:data.category||'その他'})});await fetchAll();}
    }catch(e){alert('エラー: '+e.message);}
    setSubmitting(false);
  }

  async function saveTxEdit(){
    if(!editTx) return;
    const url=editTx.type==='expense'?`${API_BASE}/expenses/${editTx.id}`:`${API_BASE}/incomes/${editTx.id}`;
    const body=editTx.type==='expense'
      ?{date:editTx.date,amount:parseFloat(editTx.amount),store:editTx.store,category:editTx.category}
      :{date:editTx.date,amount:parseFloat(editTx.amount),source:editTx.store,category:editTx.category};
    await fetch(url,{method:'PATCH',headers:H(),body:JSON.stringify(body)});
    setEditTx(null);await fetchAll();
  }
  async function deleteTx(type,id){
    if(!confirm('削除しますか？')) return;
    await fetch(`${API_BASE}/${type==='expense'?'expenses':'incomes'}/${id}`,{method:'DELETE',headers:H()});
    await fetchAll();
  }
  async function addAsset(){
    await fetch(`${API_BASE}/assets`,{method:'POST',headers:H(),body:JSON.stringify({name:assetForm.name,amount:parseFloat(assetForm.amount)||0,note:assetForm.note,updated_at:today()})});
    setShowAddAsset(false);setAssetForm({name:'',amount:'',note:''});await fetchAll();
  }
  async function saveAssetEdit(){
    await fetch(`${API_BASE}/assets/${editAsset.id}`,{method:'PATCH',headers:H(),body:JSON.stringify({name:editAsset.name,amount:parseFloat(editAsset.amount),note:editAsset.note||'',updated_at:today()})});
    setEditAsset(null);await fetchAll();
  }
  async function deleteAsset(id){
    if(!confirm('削除しますか？')) return;
    await fetch(`${API_BASE}/assets/${id}`,{method:'DELETE',headers:H()});await fetchAll();
  }

  // ── 集計 ──
  const monthExp = useMemo(()=>expenses.filter(e=>e.date?.startsWith(month)),[expenses,month]);
  const monthInc = useMemo(()=>incomes.filter(i=>i.date?.startsWith(month)),[incomes,month]);
  const totalExp  = monthExp.reduce((s,e)=>s+e.amount,0);
  const totalInc  = monthInc.reduce((s,i)=>s+i.amount,0);
  const totalAsset= assets.reduce((s,a)=>s+a.amount,0);

  const grouped = useMemo(()=>{
    const all=[...monthExp.map(e=>({...e,_type:'expense',_name:e.store})),...monthInc.map(i=>({...i,_type:'income',_name:i.source}))].sort((a,b)=>b.date.localeCompare(a.date));
    const map={};
    all.forEach(tx=>{ if(!map[tx.date]) map[tx.date]=[]; map[tx.date].push(tx); });
    return Object.entries(map).sort((a,b)=>b[0].localeCompare(a[0]));
  },[monthExp,monthInc]);

  const catSummary = useMemo(()=>{
    const m={};
    monthExp.forEach(e=>{m[e.category]=(m[e.category]||0)+e.amount;});
    return Object.entries(m).sort((a,b)=>b[1]-a[1]);
  },[monthExp]);

  const barData = useMemo(()=>{
    const months=Array.from({length:6},(_,i)=>shiftMonth(month,i-5));
    return {
      labels:months.map(m=>{const[,mo]=m.split('-');return`${parseInt(mo)}月`;}),
      datasets:[
        {label:'収入',data:months.map(m=>incomes.filter(i=>i.date?.startsWith(m)).reduce((s,i)=>s+i.amount,0)),backgroundColor:'rgba(59,130,246,0.75)',borderRadius:5},
        {label:'支出',data:months.map(m=>expenses.filter(e=>e.date?.startsWith(m)).reduce((s,e)=>s+e.amount,0)),backgroundColor:'rgba(232,74,95,0.75)',borderRadius:5},
      ],
    };
  },[expenses,incomes,month]);

  const lineData = useMemo(()=>{
    const months=Array.from({length:6},(_,i)=>shiftMonth(month,i-5));
    let bal=0;
    return {
      labels:months.map(m=>{const[,mo]=m.split('-');return`${parseInt(mo)}月`;}),
      datasets:[{label:'残高',data:months.map(m=>{
        const inc=incomes.filter(i=>i.date?.startsWith(m)).reduce((s,i)=>s+i.amount,0);
        const exp=expenses.filter(e=>e.date?.startsWith(m)).reduce((s,e)=>s+e.amount,0);
        bal+=inc-exp; return bal;
      }),borderColor:'#6366f1',backgroundColor:'rgba(99,102,241,0.1)',tension:0.4,fill:true,pointBackgroundColor:'#6366f1',pointRadius:4}],
    };
  },[expenses,incomes,month]);

  if(!mounted) return null;

  // ── ログイン前 ──
  if(!token){
    return (
      <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',padding:'16px',background:'linear-gradient(135deg,#0f172a 0%,#1e1b4b 50%,#0f172a 100%)'}}>
        <div style={{width:'100%',maxWidth:'400px',background:'white',borderRadius:'20px',padding:'36px',boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
          <div style={{textAlign:'center',marginBottom:'28px'}}>
            <div style={{fontSize:'40px',marginBottom:'8px'}}>💰</div>
            <h1 style={{fontSize:'24px',fontWeight:'800',color:'#0f172a'}}>AI家計簿</h1>
          </div>
          <form onSubmit={handleAuth}>
            {authErr&&<p style={{color:'#e84a5f',fontSize:'13px',marginBottom:'12px',textAlign:'center'}}>{authErr}</p>}
            <input className="field-input" type="email" placeholder="メールアドレス" value={email} onChange={e=>setEmail(e.target.value)} required style={{marginBottom:'12px',display:'block'}}/>
            <input className="field-input" type="password" placeholder="パスワード" value={password} onChange={e=>setPwd(e.target.value)} required style={{marginBottom: authMode==='login'?'20px':'12px',display:'block'}}/>
            {authMode==='register'&&(
              <>
                <input className="field-input" type="password" placeholder="パスワード（確認用）" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} required style={{marginBottom:'12px',display:'block'}}/>
                <div style={{display:'flex',gap:'12px',marginBottom:'20px'}}>
                  <div style={{flex:1}}>
                    <label style={{fontSize:'12px',color:'#6b7280',marginBottom:'4px',display:'block'}}>生年月日</label>
                    <input className="field-input" type="date" value={dob} onChange={e=>setDob(e.target.value)} required style={{display:'block'}}/>
                  </div>
                  <div style={{width:'80px'}}>
                    <label style={{fontSize:'12px',color:'#6b7280',marginBottom:'4px',display:'block'}}>年齢</label>
                    <input className="field-input" type="number" value={age} readOnly style={{display:'block',background:'#f3f4f6',color:'#9ca3af'}}/>
                  </div>
                </div>
              </>
            )}
            <button type="submit" style={{width:'100%',padding:'13px',borderRadius:'12px',background:'#e84a5f',color:'white',fontWeight:'700',fontSize:'16px',border:'none'}}>
              {authMode==='login'?'ログイン':'登録'}
            </button>
          </form>
          {authMode === 'login' && (
            <div style={{marginTop:'12px',textAlign:'center'}}>
              <a href="/forgot-password" style={{color:'#6b7280',fontSize:'13px',textDecoration:'underline'}}>パスワードを忘れた場合</a>
            </div>
          )}
          <div style={{marginTop:'16px',textAlign:'center'}}>
            <button onClick={()=>{setAuthMode(m=>m==='login'?'register':'login');setAuthErr('');}} style={{color:'#6b7280',fontSize:'13px',textDecoration:'underline',background:'none',border:'none',cursor:'pointer'}}>
              {authMode==='login'?'アカウントを作成':'ログイン画面に戻る'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── トランザクションリスト（共通） ──
  const TxList = () => (
    <>
      {loading&&<div style={{textAlign:'center',padding:'40px'}}><Loader2 className="spinner" size={28} style={{color:'#e84a5f'}}/></div>}
      {initErr&&<div style={{margin:'12px 14px',background:'#fee2e2',borderRadius:'10px',padding:'12px',color:'#b91c1c',fontSize:'13px'}}>{initErr}<button onClick={fetchAll} style={{marginLeft:'8px',textDecoration:'underline'}}>再試行</button></div>}
      {!loading&&grouped.length===0&&(
        <div className="empty-state"><p style={{fontSize:'32px',marginBottom:'8px'}}>📝</p><p>この月のデータがありません</p><p style={{fontSize:'12px',marginTop:'4px'}}>下の入力バーから記録しましょう</p></div>
      )}
      {grouped.map(([date,txs])=>{
        const d=new Date(date+'T00:00:00');
        const dow=WEEKDAYS[d.getDay()];
        const dayInc=txs.filter(t=>t._type==='income').reduce((s,t)=>s+t.amount,0);
        const dayExp=txs.filter(t=>t._type==='expense').reduce((s,t)=>s+t.amount,0);
        return (
          <div key={date} className="tx-date-group">
            <div className="tx-date-header">
              <div className="tx-date-day">{d.getDate()}</div>
              <div className="tx-date-meta">
                <div className="tx-date-month">{d.getFullYear()}.{String(d.getMonth()+1).padStart(2,'0')}</div>
                <span className={`tx-date-weekday${d.getDay()===0?' sun':d.getDay()===6?' sat':''}`}>{dow}曜日</span>
              </div>
              <div className="tx-date-amounts">
                {dayInc>0&&<div className="tx-date-inc">¥{dayInc.toLocaleString()}</div>}
                {dayExp>0&&<div className="tx-date-exp">¥{dayExp.toLocaleString()}</div>}
              </div>
            </div>
            {txs.map(tx=>(
              <div key={tx._type+tx.id} className="tx-row" onClick={()=>setEditTx({...tx,type:tx._type,store:tx._type==='expense'?tx.store:tx.source,amount:String(tx.amount)})}>
                <div className="tx-category">{tx.category}</div>
                <div className="tx-name">{tx._name}</div>
                <div className={tx._type==='income'?'tx-amount-income':'tx-amount-expense'}>¥{tx.amount.toLocaleString()}</div>
                <button onClick={ev=>{ev.stopPropagation();deleteTx(tx._type,tx.id);}} style={{marginLeft:'10px',color:'#d1d5db',padding:'4px'}}><Trash2 size={13}/></button>
              </div>
            ))}
          </div>
        );
      })}
    </>
  );

  // ── 右パネル (PC用) ──
  const RightPanel = () => (
    <div className="home-right-panel">
      {/* 残高カード */}
      <div style={{background:'linear-gradient(135deg,#0f172a,#1e1b4b)',borderRadius:'16px',padding:'20px',color:'white'}}>
        <div style={{fontSize:'11px',color:'#94a3b8',marginBottom:'6px'}}>収支バランス</div>
        <div style={{fontSize:'28px',fontWeight:'800',color:totalInc-totalExp>=0?'#34d399':'#f87171'}}>{totalInc-totalExp>=0?'+':''}¥{(totalInc-totalExp).toLocaleString()}</div>
        <div style={{display:'flex',gap:'16px',marginTop:'12px',fontSize:'13px'}}>
          <div><span style={{color:'#94a3b8'}}>収入 </span><span style={{color:'#60a5fa',fontWeight:'700'}}>¥{totalInc.toLocaleString()}</span></div>
          <div><span style={{color:'#94a3b8'}}>支出 </span><span style={{color:'#f87171',fontWeight:'700'}}>¥{totalExp.toLocaleString()}</span></div>
        </div>
      </div>

      {/* パイチャート */}
      {catSummary.length>0&&(
        <div className="section-card" style={{padding:'16px'}}>
          <div className="section-title" style={{marginBottom:'12px'}}>カテゴリ別支出</div>
          <div style={{display:'flex',justifyContent:'center',marginBottom:'12px'}}>
            <div style={{width:'160px',height:'160px'}}>
              <Pie data={{labels:catSummary.map(([c])=>c),datasets:[{data:catSummary.map(([,v])=>v),backgroundColor:CAT_COLORS.slice(0,catSummary.length),borderWidth:0}]}} options={{plugins:{legend:{display:false}},cutout:'35%'}}/>
            </div>
          </div>
          {catSummary.slice(0,5).map(([cat,val],i)=>{
            const pct=totalExp>0?Math.round(val/totalExp*100):0;
            return (
              <div key={cat} style={{display:'flex',alignItems:'center',gap:'8px',padding:'5px 0',borderBottom:'1px solid #f1f5f9',fontSize:'13px'}}>
                <span style={{width:'10px',height:'10px',borderRadius:'2px',background:CAT_COLORS[i%CAT_COLORS.length],flexShrink:0,display:'inline-block'}}/>
                <span style={{flex:1,color:'#374151'}}>{cat}</span>
                <span style={{color:'#6b7280',fontSize:'11px'}}>{pct}%</span>
                <span style={{fontWeight:'600',color:'#1a1a2e'}}>¥{val.toLocaleString()}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* 資産サマリー */}
      <div className="section-card" style={{padding:'16px'}}>
        <div className="section-title" style={{marginBottom:'10px'}}>資産サマリー</div>
        {assets.length===0?<div style={{color:'#9ca3af',fontSize:'13px'}}>資産未登録</div>:
          assets.map(a=>(
            <div key={a.id} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid #f1f5f9',fontSize:'13px'}}>
              <span style={{color:'#374151'}}>{a.name}</span>
              <span style={{fontWeight:'600',color:'#e84a5f'}}>¥{a.amount.toLocaleString()}</span>
            </div>
          ))
        }
        {assets.length>0&&<div style={{display:'flex',justifyContent:'space-between',padding:'8px 0 0',fontSize:'13px',fontWeight:'700'}}><span>合計</span><span style={{color:'#e84a5f'}}>¥{totalAsset.toLocaleString()}</span></div>}
      </div>
    </div>
  );

  // ── 入力バー ──
  const InputBar = () => (
    <div className="input-float">
      <div className="input-bar">
        <input type="file" accept="image/*" ref={fileRef} onChange={handleImageUpload} style={{display:'none'}}/>
        <div className="input-mode-toggle">
          <button className={`input-mode-btn${inputMode==='expense'?' active-expense':''}`} onClick={()=>setInputMode('expense')}>支出</button>
          <button className={`input-mode-btn${inputMode==='income'?' active-income':''}`}  onClick={()=>setInputMode('income')}>収入</button>
        </div>
        <input type="text"
          placeholder={submitting?'登録中…':inputMode==='expense'?'支出を入力 (例: コーヒー 500)':'収入を入力 (例: 給料 250000)'}
          value={inputText} onChange={e=>setInputText(e.target.value)} disabled={submitting}
          onKeyDown={e=>{ if(e.key==='Enter'&&!e.nativeEvent.isComposing){ e.preventDefault(); handleSubmit(); }}}
        />
        <button style={{color:'#9ca3af',padding:'4px',flexShrink:0}} onClick={()=>fileRef.current?.click()} disabled={submitting}><Camera size={17}/></button>
        <button className="send-btn" onClick={handleSubmit} disabled={submitting||!inputText.trim()}>
          {submitting?<Loader2 size={15} className="spinner"/>:<Send size={15}/>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="app-with-sidebar">

      {/* ─── デスクトップ サイドバー ─── */}
      <aside className="desktop-sidebar">
        <div className="sidebar-brand">💰 AI家計簿</div>
        <nav className="sidebar-nav">
          {[
            {id:'home', icon:BookOpen,  label:'家計簿'},
            {id:'stats',icon:BarChart3, label:'統計'},
            {id:'assets',icon:Database, label:'資産'},
          ].map(({id,icon:Icon,label})=>(
            <button key={id} className={`sn-item${tab===id?' sn-active':''}`} onClick={()=>setTab(id)}>
              <Icon size={18}/><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-balance-card">
            <div className="sidebar-balance-label">総資産</div>
            <div className="sidebar-balance-amount">¥{totalAsset.toLocaleString()}</div>
          </div>
          <button className="sidebar-logout-btn" onClick={handleLogout}>
            <LogOut size={14} style={{display:'inline',marginRight:'6px',verticalAlign:'middle'}}/>ログアウト
          </button>
        </div>
      </aside>

      {/* ─── メインパネル ─── */}
      <div className="app-layout">
        <div className="main-scroll-area" style={tab==='stats'?{background:'#0f0f1a'}:{}}>

          {/* ── 家計簿タブ ── */}
          {tab==='home'&&(
            <>
              <div className="app-header">
                <div className="header-title">家計簿</div>
                <div className="month-nav">
                  <button className="month-nav-btn" onClick={()=>setMonth(m=>shiftMonth(m,-1))}><ChevronLeft size={18}/></button>
                  <span className="month-label">{fmtMonth(month)}</span>
                  <button className="month-nav-btn" onClick={()=>setMonth(m=>shiftMonth(m,1))}><ChevronRight size={18}/></button>
                </div>
                <div className="summary-bar">
                  <div className="summary-cell"><div className="summary-label">収入</div><div className="summary-income">¥{totalInc.toLocaleString()}</div></div>
                  <div className="summary-cell"><div className="summary-label">支出</div><div className="summary-expense">¥{totalExp.toLocaleString()}</div></div>
                  <div className="summary-cell"><div className="summary-label">合計</div><div className="summary-total" style={{color:totalInc-totalExp>=0?'#1a1a2e':'#e84a5f'}}>¥{(totalInc-totalExp).toLocaleString()}</div></div>
                </div>
              </div>
              {/* 2カラム（PCのみ） */}
              <div className="home-columns" style={{flex:1}}>
                <div className="home-left"><TxList/></div>
                <RightPanel/>
              </div>
              <InputBar/>
            </>
          )}

          {/* ── 統計タブ ── */}
          {tab==='stats'&&(
            <div className="stats-bg">
              <div className="stats-header">
                <div className="stats-header-title" style={{fontSize:'17px',fontWeight:'700',color:'white'}}>統計</div>
                <div className="stats-month-nav">
                  <button className="stats-month-btn" onClick={()=>setMonth(m=>shiftMonth(m,-1))}><ChevronLeft size={18}/></button>
                  <span style={{fontSize:'15px',fontWeight:'600',color:'white',minWidth:'100px',textAlign:'center'}}>{fmtMonth(month)}</span>
                  <button className="stats-month-btn" onClick={()=>setMonth(m=>shiftMonth(m,1))}><ChevronRight size={18}/></button>
                </div>
              </div>
              <div className="stats-summary">
                <div className="stats-summary-item"><div className="stats-summary-label">収入</div><div className="stats-summary-income">¥{totalInc.toLocaleString()}</div></div>
                <div style={{width:'1px',background:'#2a2a3e'}}/>
                <div className="stats-summary-item"><div className="stats-summary-label">支出</div><div className="stats-summary-expense">¥{totalExp.toLocaleString()}</div></div>
              </div>

              {/* PC: 2カラムグリッド */}
              <div className="stats-charts-grid">
                {/* 棒グラフ */}
                <div className="stats-card" style={{margin:0}}>
                  <div className="stats-card-title">収入 / 支出（直近6ヶ月）</div>
                  <Bar data={barData} options={{plugins:{legend:{labels:{color:'#aaa',font:{size:11}}}},scales:{x:{ticks:{color:'#888',font:{size:11}},grid:{color:'rgba(255,255,255,0.05)'}},y:{ticks:{color:'#888',font:{size:11},callback:v=>`${(v/1000).toFixed(0)}k`},grid:{color:'rgba(255,255,255,0.05)'}}}}}/>
                </div>
                {/* 折れ線グラフ */}
                <div className="stats-card" style={{margin:0}}>
                  <div className="stats-card-title">残高推移（直近6ヶ月）</div>
                  <Line data={lineData} options={{plugins:{legend:{display:false}},scales:{x:{ticks:{color:'#888',font:{size:11}},grid:{display:false}},y:{ticks:{color:'#888',font:{size:11},callback:v=>`${(v/10000).toFixed(0)}万`},grid:{color:'rgba(255,255,255,0.05)'}}}}}/>
                </div>
              </div>

              {/* カテゴリ別 */}
              {catSummary.length>0&&(
                <div className="stats-cat-full">
                  <div className="stats-card" style={{margin:0}}>
                    <div className="stats-card-title">カテゴリ別支出</div>
                    <div style={{display:'flex',gap:'24px',alignItems:'flex-start',flexWrap:'wrap'}}>
                      <div style={{width:'180px',height:'180px',flexShrink:0}}>
                        <Pie data={{labels:catSummary.map(([c])=>c),datasets:[{data:catSummary.map(([,v])=>v),backgroundColor:CAT_COLORS.slice(0,catSummary.length),borderWidth:0}]}} options={{plugins:{legend:{display:false}},cutout:'40%'}}/>
                      </div>
                      <div style={{flex:1}}>
                        {catSummary.map(([cat,val],i)=>{
                          const pct=totalExp>0?Math.round(val/totalExp*100):0;
                          return (
                            <div key={cat} className="cat-row">
                              <span className="cat-badge" style={{background:CAT_COLORS[i%CAT_COLORS.length]}}>{pct}%</span>
                              <span className="cat-name">{cat}</span>
                              <span className="cat-amount">¥{val.toLocaleString()}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── 資産タブ ── */}
          {tab==='assets'&&(
            <>
              <div className="app-header">
                <div className="header-title">資産</div>
                <div style={{flex:1,paddingLeft:'32px'}}>
                  <div style={{fontSize:'11px',color:'#6b7280'}}>総資産</div>
                  <div style={{fontSize:'22px',fontWeight:'800',color:'#e84a5f'}}>¥{totalAsset.toLocaleString()}</div>
                </div>
              </div>
              <div className="assets-desktop-wrap section-card" style={{margin:'16px'}}>
                <div className="section-header">
                  <span className="section-title">資産一覧</span>
                  <button className="add-btn" onClick={()=>{setShowAddAsset(true);setAssetForm({name:'',amount:'',note:''});}}><Plus size={13}/>追加</button>
                </div>
                {assets.length===0?<div className="empty-state">「追加」ボタンで資産を登録</div>:(
                  <table className="asset-table">
                    <thead><tr><th>資産名</th><th style={{textAlign:'right'}}>金額</th><th>メモ</th><th>更新日</th><th/></tr></thead>
                    <tbody>
                      {assets.map(a=>(
                        <tr key={a.id}>
                          <td style={{fontWeight:'600'}}>{a.name}</td>
                          <td className="amount-cell">¥{a.amount.toLocaleString()}</td>
                          <td style={{color:'#6b7280',fontSize:'13px'}}>{a.note||'—'}</td>
                          <td style={{color:'#9ca3af',fontSize:'12px',whiteSpace:'nowrap'}}>{a.updated_at||'—'}</td>
                          <td style={{whiteSpace:'nowrap'}}>
                            <button onClick={()=>setEditAsset({...a,amount:String(a.amount)})} style={{color:'#9ca3af',padding:'4px'}}><Pencil size={14}/></button>
                            <button onClick={()=>deleteAsset(a.id)} style={{color:'#9ca3af',padding:'4px',marginLeft:'4px'}}><Trash2 size={14}/></button>
                          </td>
                        </tr>
                      ))}
                      <tr style={{background:'#f9f9fb'}}>
                        <td style={{fontWeight:'700'}}>合計</td>
                        <td className="amount-cell" style={{fontSize:'15px'}}>¥{totalAsset.toLocaleString()}</td>
                        <td colSpan={3}/>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>

        {/* ── モバイル用ボトムタブ ── */}
        <div className="bottom-tab-bar">
          {[{id:'home',icon:BookOpen,label:'家計簿'},{id:'stats',icon:BarChart3,label:'統計'},{id:'assets',icon:Database,label:'資産'}].map(({id,icon:Icon,label})=>(
            <button key={id} className={`tab-btn${tab===id?' active':''}`} onClick={()=>setTab(id)}>
              <Icon size={22}/><span>{label}</span>
            </button>
          ))}
        </div>

        {/* ── モバイル用入力バー（家計簿タブ以外は非表示） ── */}
        {tab==='home'&&<div className="mobile-input-bar" style={{display:'block'}}/>}
      </div>

      {/* ─── モーダル群 ─── */}
      {editTx&&(
        <ModalSheet title={editTx.type==='expense'?'支出を編集':'収入を編集'} onClose={()=>setEditTx(null)}>
          <Field label="品名・収入源"><input className="field-input" value={editTx.store} onChange={e=>setEditTx({...editTx,store:e.target.value})}/></Field>
          <Field label="金額（円）"><input className="field-input" type="number" value={editTx.amount} onChange={e=>setEditTx({...editTx,amount:e.target.value})}/></Field>
          <Field label="カテゴリ">
            <select className="field-input" value={editTx.category} onChange={e=>setEditTx({...editTx,category:e.target.value})}>
              {(editTx.type==='expense'?EXPENSE_CATS:INCOME_CATS).map(c=><option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="日付"><input className="field-input" type="date" value={editTx.date} onChange={e=>setEditTx({...editTx,date:e.target.value})}/></Field>
          <div className="modal-actions">
            <button className="btn-cancel" onClick={()=>setEditTx(null)}>キャンセル</button>
            <button className="btn-save" onClick={saveTxEdit}>保存する</button>
          </div>
        </ModalSheet>
      )}
      {showAddAsset&&(
        <ModalSheet title="資産を追加" onClose={()=>setShowAddAsset(false)}>
          <Field label="資産名"><input className="field-input" placeholder="現金" value={assetForm.name} onChange={e=>setAssetForm({...assetForm,name:e.target.value})}/></Field>
          <Field label="金額（円）"><input className="field-input" type="number" value={assetForm.amount} onChange={e=>setAssetForm({...assetForm,amount:e.target.value})}/></Field>
          <Field label="メモ（任意）"><input className="field-input" value={assetForm.note} onChange={e=>setAssetForm({...assetForm,note:e.target.value})}/></Field>
          <div className="modal-actions"><button className="btn-cancel" onClick={()=>setShowAddAsset(false)}>キャンセル</button><button className="btn-save" onClick={addAsset}>追加する</button></div>
        </ModalSheet>
      )}
      {editAsset&&(
        <ModalSheet title="資産を編集" onClose={()=>setEditAsset(null)}>
          <Field label="資産名"><input className="field-input" value={editAsset.name} onChange={e=>setEditAsset({...editAsset,name:e.target.value})}/></Field>
          <Field label="金額（円）"><input className="field-input" type="number" value={editAsset.amount} onChange={e=>setEditAsset({...editAsset,amount:e.target.value})}/></Field>
          <Field label="メモ"><input className="field-input" value={editAsset.note||''} onChange={e=>setEditAsset({...editAsset,note:e.target.value})}/></Field>
          <div className="modal-actions"><button className="btn-cancel" onClick={()=>setEditAsset(null)}>キャンセル</button><button className="btn-save" onClick={saveAssetEdit}>保存する</button></div>
        </ModalSheet>
      )}
    </div>
  );
}
