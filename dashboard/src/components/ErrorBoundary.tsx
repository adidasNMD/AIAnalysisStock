import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] 捕获渲染异常:', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          minHeight: '400px', gap: '16px', color: 'var(--text-secondary)', padding: '40px'
        }}>
          <AlertTriangle size={48} style={{ color: 'var(--accent-crimson)' }} />
          <h2 style={{ fontSize: '1.2rem', color: 'var(--text-primary)' }}>渲染异常</h2>
          <p style={{ fontSize: '0.85rem', maxWidth: '500px', textAlign: 'center', lineHeight: 1.6 }}>
            某个组件发生了意外错误，但系统的其他部分仍在运行。
          </p>
          <pre style={{
            fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--accent-crimson)',
            background: 'rgba(255,51,102,0.08)', padding: '12px 16px', borderRadius: '6px',
            maxWidth: '600px', overflow: 'auto', maxHeight: '120px'
          }}>
            {this.state.error?.message}
          </pre>
          <button
            onClick={this.handleReset}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--glass-border)',
              background: 'rgba(0,229,255,0.08)', color: 'var(--accent-cyan)',
              cursor: 'pointer', fontSize: '0.85rem'
            }}
          >
            <RefreshCw size={14} /> 重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
