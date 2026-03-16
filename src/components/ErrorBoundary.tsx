import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
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
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#050505] text-red-500 font-mono flex flex-col items-center justify-center p-10 text-center">
          <h1 className="text-2xl font-bold mb-4 uppercase tracking-widest">System Failure</h1>
          <p className="text-sm opacity-80 mb-6">
            Sir, it appears there is a critical failure in the neural interface.
          </p>
          <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl max-w-2xl overflow-auto text-left">
            <code className="text-xs">{this.state.error?.toString()}</code>
          </div>
          <button 
            onClick={() => window.location.reload()}
            className="mt-8 px-6 py-2 bg-red-500 text-black font-bold rounded-lg hover:bg-red-400 transition-colors"
          >
            REBOOT SYSTEM
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
