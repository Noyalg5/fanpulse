'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/dashboard', label: 'Overview', exact: true },
  { href: '/dashboard/supporters', label: 'Supporters', exact: false },
];

export function DashboardNav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1">
      {LINKS.map(({ href, label, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              active ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
