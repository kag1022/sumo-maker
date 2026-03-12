import React from 'react';
import { Archive, FolderClock, Plus } from 'lucide-react';

type IdleScreen = 'home' | 'build' | 'hall';

interface AppShellProps {
  idleScreen: IdleScreen;
  phase: 'idle' | 'running' | 'completed' | 'error';
  onReset: () => void | Promise<void>;
  onSelectIdleScreen: (screen: IdleScreen) => void | Promise<void>;
  children: React.ReactNode;
}

const navButtonClass = (active: boolean) =>
  `shell-nav-button ${active ? 'is-active' : ''}`;

export const AppShell: React.FC<AppShellProps> = ({
  idleScreen,
  phase,
  onReset,
  onSelectIdleScreen,
  children,
}) => (
  <div className="app-shell">
    <header className="app-header">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <button className="app-brand" onClick={() => void onReset()}>
          <span className="pixel-icon-badge hidden sm:inline-flex">土</span>
          <div>
            <div className="shell-kicker">相撲育成録</div>
            <div className="ui-text-heading text-[1.85rem] leading-none text-text sm:text-[2.15rem]">
              爆速！横綱メーカー
            </div>
            <div className="mt-1 text-xs text-text-dim">
              力士を育て、土俵人生を読み、記録として残す。
            </div>
          </div>
        </button>

        {phase === 'idle' && (
          <nav className="flex flex-wrap items-center gap-2">
            <button type="button" className={navButtonClass(idleScreen === 'home')} onClick={() => void onSelectIdleScreen('home')}>
              <FolderClock size={14} />
              入口
            </button>
            <button type="button" className={navButtonClass(idleScreen === 'build')} onClick={() => void onSelectIdleScreen('build')}>
              <Plus size={14} />
              設計
            </button>
            <button type="button" className={navButtonClass(idleScreen === 'hall')} onClick={() => void onSelectIdleScreen('hall')}>
              <Archive size={14} />
              収蔵庫
            </button>
          </nav>
        )}
      </div>
    </header>

    <main className="app-main">{children}</main>
  </div>
);
