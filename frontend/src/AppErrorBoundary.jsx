import { Component } from 'react'

export default class AppErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Transport UI render error:', error)
    console.error('Transport UI component stack:', info?.componentStack || '')
  }

  retry = () => {
    this.setState({ error: null })
    window.location.reload()
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#f4f8f5', fontFamily: 'Inter, system-ui, sans-serif' }}>
        <section style={{ width: 'min(100%, 640px)', background: '#fff', border: '1px solid #dce7e1', borderRadius: 20, padding: 28, boxShadow: '0 16px 45px rgba(18, 59, 42, 0.08)' }}>
          <span style={{ display: 'inline-block', fontSize: 12, fontWeight: 800, letterSpacing: '.08em', color: '#b42318' }}>SISTEM TRANSPORT</span>
          <h1 style={{ margin: '8px 0 10px', fontSize: 24 }}>Halaman mengalami error</h1>
          <p style={{ margin: 0, color: '#5d6b64', lineHeight: 1.6 }}>Data Anda tetap tersimpan. Tampilan tidak dapat dirender untuk sementara. Silakan muat ulang halaman.</p>
          <button type="button" onClick={this.retry} style={{ marginTop: 20, border: 0, borderRadius: 12, padding: '11px 16px', background: '#123b2a', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Muat Ulang Halaman</button>
        </section>
      </main>
    )
  }
}
