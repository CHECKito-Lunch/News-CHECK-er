'use client';

import { useEffect } from 'react';

type Props = {
  /** CSS-Selector des Containers, in dem das HTML steckt (z. B. "#article-root") */
  containerSelector: string;
  postId?: number;
  postSlug?: string;
};

export default function PollsClient({ containerSelector, postId, postSlug }: Props) {
  useEffect(() => {
    const root = document.querySelector(containerSelector) as HTMLElement | null;
    if (!root) return;

    const nodes = Array.from(root.querySelectorAll<HTMLDivElement>('div[data-type="poll"]'));
    if (!nodes.length) return;

    nodes.forEach((el) => {
      const pollId = el.getAttribute('data-id') || '';
      const question = el.getAttribute('data-question') || 'Abstimmung';
      let options: string[] = [];
      try {
        options = JSON.parse(el.getAttribute('data-options') || '[]');
      } catch {
        options = [];
      }

      // UI-Wrapper erstellen
      const wrapper = document.createElement('div');
      wrapper.className = 'rounded-xl border p-4 my-4 bg-white/60 dark:bg-white/5 border-gray-200 dark:border-gray-700';
      wrapper.innerHTML = `
        <div class="text-xs font-medium text-gray-500 mb-2">Abstimmung</div>
        <div class="text-sm font-semibold mb-3">${escapeHtml(question)}</div>
        <div data-role="opts" class="flex flex-wrap gap-2 mb-2">
          ${options.map((o, i) => `
            <button data-idx="${i}" class="px-3 py-1.5 rounded border text-sm
                    border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
              ${escapeHtml(o)}
            </button>
          `).join('')}
        </div>
        <div data-role="result" class="text-xs text-gray-500"></div>
      `;
      el.replaceWith(wrapper);

      // Click-Handler
      wrapper.querySelectorAll<HTMLButtonElement>('button[data-idx]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const idx = Number(btn.dataset.idx);
          btn.disabled = true;
          try {
            const res = await fetch('/api/polls/vote', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pollId, optionIndex: idx, postId, postSlug }),
            }).then(r => r.json());

            const result = wrapper.querySelector('[data-role="result"]') as HTMLDivElement;
            if (res?.counts && Array.isArray(res.counts)) {
              const total = res.counts.reduce((s: number, c: any) => s + Number(c.votes || 0), 0) || 0;
              const lines = res.counts.map((c: any) => {
                const name = options[c.option_index] ?? `Option ${c.option_index}`;
                const votes = Number(c.votes || 0);
                const pct = total ? Math.round((votes / total) * 100) : 0;
                return `${escapeHtml(name)}: ${votes} (${pct}%)`;
              });
              result.textContent = total ? lines.join(' · ') : 'Noch keine Stimmen';
            } else {
              (wrapper.querySelector('[data-role="result"]') as HTMLDivElement).textContent =
                res?.alreadyVoted ? 'Du hast bereits abgestimmt.' : 'Danke für deine Stimme!';
            }

            // Nach Vote: Buttons optional deaktivieren
            wrapper.querySelectorAll<HTMLButtonElement>('button[data-idx]').forEach(b => (b.disabled = true));
          } catch {
            btn.disabled = false;
          }
        });
      });
    });

    return () => {
      // nichts zu cleanen; Buttons sind im DOM ersetzt
    };
  }, [containerSelector, postId, postSlug]);

  return null;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (m) => (
    m === '&' ? '&amp;' :
    m === '<' ? '&lt;'  :
    m === '>' ? '&gt;'  :
    m === '"' ? '&quot;':
                '&#39;'
  ));
}
