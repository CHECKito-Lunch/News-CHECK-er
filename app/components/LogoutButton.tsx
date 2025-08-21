'use client';

import { useState } from 'react';

export default function LogoutButton() {
  const [loading, setLoading] = useState(false);

  async function onLogout() {
    setLoading(true);
    try {
      // Lokale Tokens aufräumen (falls verwendet)
      localStorage.removeItem('editorAuth');
      sessionStorage.removeItem('editorAuth');
      localStorage.removeItem('basicAuth');
      sessionStorage.removeItem('basicAuth');

      // Eventuelle Cookie-basierte Session löschen (Serverroute unten)
      await fetch('/api/logout', { method: 'POST' }).catch(() => {});

      // Zur Sicherheit evtl. Cookies clientseitig unbrauchbar machen
      document.cookie = 'admin_auth=; Max-Age=0; path=/';
      document.cookie = 'editor_auth=; Max-Age=0; path=/';
    } finally {
      // Redirect raus aus dem Admin
      window.location.href = '/';
    }
  }

  return (
    <button
      type="button"
      onClick={onLogout}
      className="px-3 py-2 rounded-xl border dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-white/10 text-sm font-medium"
      disabled={loading}
      aria-busy={loading}
    >
      {loading ? 'Logge aus…' : 'Logout'}
    </button>
  );
}
