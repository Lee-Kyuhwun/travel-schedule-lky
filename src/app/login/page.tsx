'use client'
// 로그인 / 회원가입 화면. Supabase Auth(이메일 + 비밀번호)를 쓴다.
import { useState, type FormEvent } from 'react'
import { getSupabase } from '../../lib/supabase/client'
import { Logo } from '../../Cover'

// Supabase 오류 메시지를 사용자용 한글 문구로 바꾼다
function messageOf(raw: string): string {
  if (/Invalid login credentials/i.test(raw)) return '이메일 또는 비밀번호가 올바르지 않아요.'
  if (/already registered/i.test(raw)) return '이미 가입된 이메일이에요. 로그인해 주세요.'
  if (/Email not confirmed/i.test(raw)) return '이메일 인증이 아직 끝나지 않았어요. 받은 메일의 링크를 눌러주세요.'
  if (/at least 6|weak/i.test(raw)) return '비밀번호는 6자 이상이어야 해요.'
  if (/fetch|network/i.test(raw)) return '서버에 연결하지 못했어요. 네트워크를 확인해주세요.'
  return '요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요.'
}

export default function LoginPage() {
  // mode: 'in' = 로그인, 'up' = 회원가입 (useState = 상태 필드 + setter)
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(''); setInfo('')
    try {
      const auth = getSupabase().auth
      if (mode === 'in') {
        const { error } = await auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        // 인증 메일의 링크는 /auth/confirm 으로 돌아온다
        const { data, error } = await auth.signUp({ email, password, options: { emailRedirectTo: location.origin + '/auth/confirm' } })
        if (error) throw error
        // 이메일 인증이 켜져 있으면 세션이 아직 없다 → 안내만 하고 멈춘다
        if (!data.session) { setInfo('인증 메일을 보냈어요. 메일의 링크를 누르면 가입이 완료돼요.'); return }
      }
      // 전체 새로고침으로 이동해 서버(proxy)가 새 세션 쿠키를 읽게 한다
      location.assign('/')
    } catch (err) {
      setError(messageOf((err as Error).message ?? ''))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth">
      <form className="form auth-card" onSubmit={submit}>
        <Logo />
        <h1>{mode === 'in' ? '로그인' : '회원가입'}</h1>
        <p className="hint">여행·일정·보관함이 계정에 저장되어 어느 기기에서든 이어서 볼 수 있어요.</p>
        <label className="field"><span>이메일</span>
          <input type="email" name="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required />
        </label>
        <label className="field"><span>비밀번호</span>
          <input type="password" name="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} minLength={6}
            value={password} onChange={e => setPassword(e.target.value)} required />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        {info && <p className="ok" role="status">{info}</p>}
        <button className="btn primary big" disabled={busy}>{busy ? '처리 중…' : mode === 'in' ? '로그인' : '가입하기'}</button>
        <button type="button" className="link" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setError(''); setInfo('') }}>
          {mode === 'in' ? '계정이 없나요? 회원가입' : '이미 계정이 있나요? 로그인'}
        </button>
      </form>
    </main>
  )
}
