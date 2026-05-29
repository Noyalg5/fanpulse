import { type ReactNode } from 'react';
import { DashboardNav } from './_components/DashboardNav';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-8">
            <div>
              <p className="text-lg font-bold tracking-tight text-gray-900">FanPulse</p>
              <p className="text-xs text-gray-400">Supporter Intelligence Platform</p>
            </div>
            <DashboardNav />
          </div>
          <p className="text-sm font-semibold text-gray-900">Falkirk FC</p>
        </div>
      </header>
      {children}
    </div>
  );
}
