import { Component, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** 予期しないエラーで画面全体が消えないよう、原因と復旧手段を表示する */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="app">
        <section className="card">
          <h2>表示中にエラーが発生しました</h2>
          <p>取り込んだデータの処理中に問題が起きました。下のボタンで最初の状態に戻せます。</p>
          <div className="notice error">
            <code>{this.state.error.message}</code>
          </div>
          <p className="muted">
            解決しない場合は、このエラー文と、使用した会計ソフト名・ファイル形式・ファイルの行数をお知らせください。
          </p>
          <button className="btn primary" onClick={() => location.reload()}>
            最初の状態に戻す
          </button>
        </section>
      </div>
    );
  }
}
