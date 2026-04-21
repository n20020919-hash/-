"use client";
import { useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://192.168.11.10:8000/api';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch(`${API_BASE}/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      setMessage(data.message || 'メールを送信しました。');
    } catch (err) {
      setMessage('エラーが発生しました。');
    }
    setLoading(false);
  }

  return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',padding:'16px',background:'linear-gradient(135deg,#0f172a 0%,#1e1b4b 50%,#0f172a 100%)'}}>
      <div style={{width:'100%',maxWidth:'400px',background:'white',borderRadius:'20px',padding:'36px',boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
        <div style={{textAlign:'center',marginBottom:'28px'}}>
          <h1 style={{fontSize:'20px',fontWeight:'800',color:'#0f172a'}}>パスワード再設定</h1>
          <p style={{fontSize:'13px',color:'#6b7280',marginTop:'8px',lineHeight:1.6}}>登録したメールアドレスを入力してください。<br/>リセット用のリンクを送信します。</p>
        </div>
        
        <form onSubmit={handleSubmit}>
          <input 
            className="field-input" 
            type="email" 
            placeholder="メールアドレス" 
            value={email} 
            onChange={e=>setEmail(e.target.value)} 
            required 
            style={{marginBottom:'20px',display:'block'}}
            disabled={loading}
          />
          <button type="submit" disabled={loading} style={{width:'100%',padding:'13px',borderRadius:'12px',background:'#e84a5f',color:'white',fontWeight:'700',fontSize:'16px',border:'none'}}>
            {loading ? <Loader2 size={18} className="spinner" style={{margin:'0 auto'}}/> : 'リセットリンクを送信'}
          </button>
        </form>
        
        {message && (
          <div style={{marginTop:'20px',padding:'12px',background:'#f0fdf4',color:'#166534',borderRadius:'8px',fontSize:'13px',textAlign:'center'}}>
            {message}
          </div>
        )}

        <div style={{marginTop:'24px',textAlign:'center'}}>
          <Link href="/" style={{color:'#6b7280',fontSize:'13px',textDecoration:'underline'}}>ログイン画面に戻る</Link>
        </div>
      </div>
    </div>
  );
}
