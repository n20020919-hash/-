"use client";
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';


const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://192.168.11.10:8000/api';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  useEffect(() => {
    if (!token) {
      setMessage({ text: '無効なアクセスです。URLをご確認ください。', type: 'error' });
    }
  }, [token]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!token) return;
    
    if (password !== confirmPassword) {
      setMessage({ text: 'パスワードが一致しません', type: 'error' });
      return;
    }
    
    setLoading(true);
    setMessage({ text: '', type: '' });
    
    try {
      const res = await fetch(`${API_BASE}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: password })
      });
      const data = await res.json();
      
      if (res.ok) {
        setMessage({ text: 'パスワードを更新しました。ログイン画面に戻ります...', type: 'success' });
        setTimeout(() => {
          router.push('/');
        }, 3000);
      } else {
        setMessage({ text: data.detail || 'エラーが発生しました。', type: 'error' });
      }
    } catch (err) {
      setMessage({ text: '接続エラーが発生しました。', type: 'error' });
    }
    setLoading(false);
  }

  return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',padding:'16px',background:'linear-gradient(135deg,#0f172a 0%,#1e1b4b 50%,#0f172a 100%)'}}>
      <div style={{width:'100%',maxWidth:'400px',background:'white',borderRadius:'20px',padding:'36px',boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
        <div style={{textAlign:'center',marginBottom:'28px'}}>
          <h1 style={{fontSize:'20px',fontWeight:'800',color:'#0f172a'}}>新しいパスワードの設定</h1>
        </div>
        
        <form onSubmit={handleSubmit}>
          <input 
            className="field-input" 
            type="password" 
            placeholder="新しいパスワード" 
            value={password} 
            onChange={e=>setPassword(e.target.value)} 
            required 
            style={{marginBottom:'12px',display:'block'}}
            disabled={loading || !token}
          />
          <input 
            className="field-input" 
            type="password" 
            placeholder="新しいパスワード（確認用）" 
            value={confirmPassword} 
            onChange={e=>setConfirmPassword(e.target.value)} 
            required 
            style={{marginBottom:'20px',display:'block'}}
            disabled={loading || !token}
          />
          <button type="submit" disabled={loading || !token} style={{width:'100%',padding:'13px',borderRadius:'12px',background:'#e84a5f',color:'white',fontWeight:'700',fontSize:'16px',border:'none'}}>
            {loading ? <Loader2 size={18} className="spinner" style={{margin:'0 auto'}}/> : 'パスワードを更新'}
          </button>
        </form>
        
        {message.text && (
          <div style={{marginTop:'20px',padding:'12px',background:message.type==='error'?'#fee2e2':'#f0fdf4',color:message.type==='error'?'#b91c1c':'#166534',borderRadius:'8px',fontSize:'13px',textAlign:'center'}}>
            {message.text}
          </div>
        )}

        <div style={{marginTop:'24px',textAlign:'center'}}>
          <Link href="/" style={{color:'#6b7280',fontSize:'13px',textDecoration:'underline'}}>ログイン画面に戻る</Link>
        </div>
      </div>
    </div>
  );
}

export default function ResetPassword() {
  return (
    <Suspense fallback={<div style={{textAlign:'center',padding:'40px'}}><Loader2 className="spinner" size={28}/></div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
