import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-[100dvh] bg-black flex flex-col items-center justify-center p-8 text-center space-y-6">
          <div className="w-20 h-20 bg-red-500/10 border border-red-500/20 rounded-3xl flex items-center justify-center text-red-500 shadow-2xl shadow-red-500/10">
            <AlertTriangle size={40} />
          </div>
          
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-white tracking-tight">Произошла ошибка</h2>
            <p className="text-neutral-500 text-sm max-w-xs mx-auto leading-relaxed">
              Что-то пошло не так в глубинах нейросети. Мы уже работаем над этим.
            </p>
          </div>

          {this.state.error && (
            <div className="w-full max-w-sm bg-neutral-900/50 border border-neutral-800 rounded-2xl p-4 overflow-hidden">
              <p className="text-[10px] font-mono text-red-400 text-left break-all uppercase tracking-widest opacity-70 mb-2">Debug Info</p>
              <p className="text-xs font-mono text-neutral-400 text-left line-clamp-3">
                {this.state.error.message}
              </p>
            </div>
          )}

          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 px-6 py-3 bg-white text-black font-bold rounded-2xl hover:bg-neutral-200 transition-all active:scale-95"
          >
            <RefreshCcw size={18} />
            Перезагрузить
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
