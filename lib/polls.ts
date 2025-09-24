// lib/polls.ts
export async function hydratePolls(root: HTMLElement) {
  const nodes = root.querySelectorAll<HTMLDivElement>('div[data-type="poll"]');
  for (const el of Array.from(nodes)) {
    const pollId   = el.getAttribute('data-id') || '';
    const question = el.getAttribute('data-question') || 'Abstimmung';
    const options  = JSON.parse(el.getAttribute('data-options') || '[]') as string[];

    const wrapper = document.createElement('div');
    wrapper.className = 'rounded-xl border p-4 my-4';
    wrapper.innerHTML = `
      <div class="text-sm font-medium mb-3">${question}</div>
      <div class="flex flex-wrap gap-2">
        ${options.map((o, i) => `<button data-idx="${i}" class="px-3 py-1.5 rounded border">${o}</button>`).join('')}
      </div>
      <div class="text-xs text-gray-500 mt-2" data-role="result"></div>
    `;
    el.replaceWith(wrapper);

    wrapper.querySelectorAll('button[data-idx]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = Number((btn as HTMLButtonElement).dataset.idx);
        const res = await fetch('/api/polls/vote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pollId, optionIndex: idx }),
        }).then(r => r.json());

        const result = wrapper.querySelector('[data-role="result"]') as HTMLDivElement;
        if (res?.counts) {
          const total = res.counts.reduce((s: number, c: any) => s + Number(c.votes || 0), 0) || 0;
          result.textContent = total
            ? res.counts.map((c: any) => `${options[c.option_index]}: ${c.votes} (${Math.round((c.votes / total) * 100)}%)`).join(' · ')
            : 'Noch keine Stimmen';
        }
      });
    });
  }
}
