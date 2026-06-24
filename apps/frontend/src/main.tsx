import React from 'react';
import ReactDOM from 'react-dom/client';
import type { PipelineStatus, Prospect } from '@hpos/contracts';
import './styles.css';

const statuses: PipelineStatus[] = [
  'new',
  'contacted',
  'tour_scheduled',
  'toured',
  'application',
  'leased',
  'lost'
];

const seedProspects: Prospect[] = [
  {
    id: '7b0644d7-5a60-470f-8159-4529c49f3a9d',
    name: 'Jamie Rivera',
    contact: { email: 'jamie@example.com', phone: '5551234567' },
    assignedUnitId: '5c7425f8-e7b5-44bf-83cd-54a63feb6817',
    status: 'new',
    assignee: 'Leasing Team'
  }
];

const App = () => (
  <main className="min-h-screen bg-zinc-50 text-zinc-950">
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-2 border-b border-zinc-200 pb-5">
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">HP Labs assessment</p>
        <h1 className="text-3xl font-semibold tracking-normal">Leasing CRM</h1>
      </header>

      <section className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
        <div className="rounded-md border border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 px-4 py-3">
            <h2 className="text-lg font-semibold">Prospects</h2>
          </div>
          <div className="divide-y divide-zinc-100">
            {seedProspects.map((prospect) => (
              <article key={prospect.id} className="grid gap-3 px-4 py-4 sm:grid-cols-[1fr_auto]">
                <div>
                  <h3 className="font-medium">{prospect.name}</h3>
                  <p className="text-sm text-zinc-600">{prospect.contact.email}</p>
                </div>
                <select
                  className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm"
                  defaultValue={prospect.status}
                >
                  {statuses.map((status) => (
                    <option key={status} value={status}>
                      {status.replace('_', ' ')}
                    </option>
                  ))}
                </select>
              </article>
            ))}
          </div>
        </div>

        <aside className="rounded-md border border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 px-4 py-3">
            <h2 className="text-lg font-semibold">Automation Queue</h2>
          </div>
          <div className="px-4 py-4 text-sm text-zinc-600">
            Status changes will create tasks and activity events through the backend rule layer.
          </div>
        </aside>
      </section>
    </div>
  </main>
);

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<App />);
